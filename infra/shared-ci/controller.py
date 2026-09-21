"""Wake/stop one EC2 host and issue single-job, repository-scoped runner configs.

EventBridge calls tick once a minute. The host calls claim/heartbeat/finish via
IAM-authenticated Lambda Invoke. GitHub PATs never leave this Lambda.
"""
import json
import os
import time
import uuid
import urllib.error
import urllib.request

IDLE_SECONDS = 600
MAX_LEASE_SECONDS = 4800
LEASE_FIELDS = ("lease_id", "job_id", "repo", "runner_id", "lease_started", "heartbeat", "cancel")


def choose_job(jobs, last_repo):
    """Alternate repositories when both have work, oldest job within each turn."""
    alternatives = [job for job in jobs if job["repo"] != last_repo]
    return min(alternatives or jobs, key=lambda job: (job["created_at"], job["id"])) if jobs else None


class AWS:
    def __init__(self):
        import boto3
        self.table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
        self.ec2 = boto3.client("ec2")
        self.secrets = boto3.client("secretsmanager")
        self.instance_id = os.environ["INSTANCE_ID"]
        self.repositories = json.loads(os.environ["REPOSITORIES"])
        self.tokens = {}

    def state(self):
        return self.table.get_item(Key={"id": "control"}, ConsistentRead=True).get("Item", {})

    def acquire(self, owner):
        now = int(time.time())
        try:
            self.table.put_item(Item={"id": "controller-lock", "owner": owner, "expires_at": now + 65},
                ConditionExpression="attribute_not_exists(id) OR expires_at < :now",
                ExpressionAttributeValues={":now": now})
            return True
        except self.table.meta.client.exceptions.ConditionalCheckFailedException:
            return False

    def unlock(self, owner):
        self.table.delete_item(Key={"id": "controller-lock"}, ConditionExpression="#o = :owner",
            ExpressionAttributeNames={"#o": "owner"}, ExpressionAttributeValues={":owner": owner})

    def patch(self, fields, expected_lease=None, new_lease=False):
        names, values, sets, removes = {}, {}, [], []
        for index, (key, value) in enumerate(fields.items()):
            name, param = f"#n{index}", f":v{index}"
            names[name] = key
            if value is None:
                removes.append(name)
            else:
                sets.append(f"{name} = {param}")
                values[param] = value
        args = {"Key": {"id": "control"}, "ExpressionAttributeNames": names}
        args["UpdateExpression"] = " ".join(filter(None, [
            "SET " + ", ".join(sets) if sets else "",
            "REMOVE " + ", ".join(removes) if removes else "",
        ]))
        if expected_lease is not None:
            names["#lease"] = "lease_id"
            values[":expected"] = expected_lease
            args["ConditionExpression"] = "#lease = :expected"
        elif new_lease:
            names["#lease"] = "lease_id"
            args["ConditionExpression"] = "attribute_not_exists(#lease)"
        if values:
            args["ExpressionAttributeValues"] = values
        try:
            self.table.update_item(**args)
            return True
        except self.table.meta.client.exceptions.ConditionalCheckFailedException:
            return False

    def github(self, repo, path, method="GET", data=None, allow_missing=False):
        if repo not in self.repositories:
            raise ValueError("Repository is not allowed")
        if repo not in self.tokens:
            secret = self.secrets.get_secret_value(SecretId=self.repositories[repo])["SecretString"]
            self.tokens[repo] = json.loads(secret)["Token"]
        request = urllib.request.Request(
            f"https://api.github.com/repos/{repo}{path}", method=method,
            data=json.dumps(data).encode() if data is not None else None,
            headers={"Authorization": f"Bearer {self.tokens[repo]}",
                     "Accept": "application/vnd.github+json", "Content-Type": "application/json",
                     "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "shared-ec2-ci"},
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            if allow_missing and error.code == 404:
                return {}
            # Do not log response bodies, headers, tokens, or JIT configs.
            raise RuntimeError(f"GitHub HTTP {error.code}: {method} {repo}{path}") from None

    def pages(self, repo, path, key):
        separator = "&" if "?" in path else "?"
        page = 1
        while True:
            items = self.github(repo, f"{path}{separator}per_page=100&page={page}")[key]
            yield from items
            if len(items) < 100:
                return
            page += 1

    def jobs(self):
        from boto3.dynamodb.conditions import Key
        result = []
        for status in ("queued", "in_progress"):
            args = {"IndexName": "status-index", "KeyConditionExpression": Key("status").eq(status)}
            while True:
                response = self.table.query(**args)
                for job in response.get("Items", []):
                    run = self.table.get_item(Key={"id": f"run#{job['run_id']}"}, ConsistentRead=True).get("Item", {})
                    if run.get("trusted") and run.get("repo") == job["repo"] and int(job.get("attempts", 0)) < 3:
                        result.append({**job, "id": int(job["job_id"])})
                if "LastEvaluatedKey" not in response:
                    break
                args["ExclusiveStartKey"] = response["LastEvaluatedKey"]
        return result

    def job_status(self, job_id):
        return self.table.get_item(Key={"id": f"job#{job_id}"}, ConsistentRead=True).get("Item", {}).get("status")

    def unclaimed(self, job_id):
        self.table.update_item(Key={"id": f"job#{job_id}"}, UpdateExpression="ADD attempts :one",
                               ExpressionAttributeValues={":one": 1})

    def finished_locally(self, job_id):
        # The single-job runner has exited. Do not reassign its job while the
        # final GitHub webhook is delayed; GitHub still owns the check result.
        self.table.update_item(Key={"id": f"job#{job_id}"},
            UpdateExpression="SET #s = :s, event_rank = :rank",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "runner_finished", ":rank": 2})

    def recover_deliveries(self):
        # GitHub does not automatically retry failed webhooks. Retry recent
        # failed deliveries not already accepted by our receiver. Delivery IDs
        # also prevent duplicate/redelivered events from resurrecting jobs.
        hooks = self.table.get_item(Key={"id": "hooks"}, ConsistentRead=True).get("Item", {}).get("hooks", {})
        now = int(time.time())
        for repo, hook_id in hooks.items():
            for delivery in self.github(repo, f"/hooks/{hook_id}/deliveries?per_page=100"):
                if 200 <= (delivery.get("status_code") or 0) < 300:
                    continue
                key = {"id": "delivery#" + delivery["guid"]}
                receipt = self.table.get_item(Key=key, ConsistentRead=True).get("Item", {})
                if receipt.get("received") or now - int(receipt.get("retry_at", 0)) < 300:
                    continue
                self.github(repo, f"/hooks/{hook_id}/deliveries/{delivery['id']}/attempts", "POST")
                self.table.update_item(Key=key,
                    UpdateExpression="SET retry_at = :now, expires_at = :ttl",
                    ExpressionAttributeValues={":now": now, ":ttl": now + 604800})

    def instance_state(self):
        response = self.ec2.describe_instances(InstanceIds=[self.instance_id])
        return response["Reservations"][0]["Instances"][0]["State"]["Name"]

    def start(self):
        self.ec2.start_instances(InstanceIds=[self.instance_id])

    def stop(self):
        self.ec2.stop_instances(InstanceIds=[self.instance_id])

    def remove_runner(self, state):
        if state.get("runner_id"):
            try:
                self.github(state["repo"], f"/actions/runners/{state['runner_id']}", "DELETE", allow_missing=True)
            except RuntimeError:
                # Ephemeral runners normally deregister themselves. A recently
                # disconnected runner can still be marked busy briefly.
                print("Runner cleanup deferred", state["runner_id"])


class Controller:
    def __init__(self, aws, now=None):
        self.aws = aws
        self.now = int(time.time()) if now is None else now

    def release(self, state):
        self.aws.remove_runner(state)
        fields = {key: None for key in LEASE_FIELDS}
        fields.update(last_busy=self.now, last_repo=state.get("repo", ""), recovering=None)
        return self.aws.patch(fields, expected_lease=state["lease_id"])

    def tick(self):
        state = self.aws.state()
        machine = self.aws.instance_state()
        if state.get("recovering"):
            if machine == "stopped":
                self.release(state)
            return {"state": "recovering"}
        if state.get("lease_id"):
            status = self.aws.job_status(state["job_id"])
            stalled_start = status == "queued" and self.now - int(state["heartbeat"]) > 300
            if self.now - int(state["lease_started"]) > MAX_LEASE_SECONDS or stalled_start:
                # Upper bound on a wedged host, beyond every workflow timeout.
                # Never free the slot until the old VM has actually stopped.
                if machine in {"running", "pending"}:
                    self.aws.stop()
                self.aws.patch({"recovering": True}, expected_lease=state["lease_id"])
                return {"state": "recovering"}
            self.aws.patch({"last_busy": self.now, "cancel": status == "completed"},
                           expected_lease=state["lease_id"])
            return {"state": "busy"}
        # An API error propagates before any stop decision. Unknown != idle.
        jobs = self.aws.jobs()
        if jobs:
            self.aws.patch({"last_busy": self.now})
            if machine == "stopped":
                self.aws.start()
            return {"state": machine, "waiting": len(jobs)}
        last_busy = int(state.get("last_busy", self.now))
        if "last_busy" not in state:
            self.aws.patch({"last_busy": self.now})
        if machine == "running" and self.now - last_busy >= IDLE_SECONDS:
            self.aws.stop()
            return {"state": "stopping"}
        return {"state": machine, "idle_seconds": self.now - last_busy}

    def claim(self):
        state = self.aws.state()
        if state.get("lease_id") or state.get("recovering"):
            return {}
        jobs = [job for job in self.aws.jobs() if job["status"] == "queued"]
        job = choose_job(jobs, state.get("last_repo"))
        if not job:
            return {}
        lease = uuid.uuid4().hex
        fields = {"lease_id": lease, "job_id": job["id"], "repo": job["repo"],
                  "lease_started": self.now, "heartbeat": self.now,
                  "last_busy": self.now, "cancel": False}
        if not self.aws.patch(fields, new_lease=True):
            return {}
        try:
            runner = self.aws.github(job["repo"], "/actions/runners/generate-jitconfig", "POST", {
                "name": f"shared-ci-{job['id']}-{lease[:8]}", "runner_group_id": 1,
                "labels": list(dict.fromkeys(["self-hosted", "Linux", "X64", *job["labels"]])),
                "work_folder": "_work",
            })
            fields["runner_id"] = runner["runner"]["id"]
            if not self.aws.patch({"runner_id": fields["runner_id"]}, expected_lease=lease):
                raise RuntimeError("Runner lease changed during registration")
            return {"lease_id": lease, "job_id": job["id"], "repo": job["repo"],
                    "jit_config": runner["encoded_jit_config"]}
        except Exception:
            self.release(fields)
            raise

    def handle(self, event):
        action = event.get("action", "tick")
        if action == "tick":
            self.aws.recover_deliveries()
            return self.tick()
        if action == "claim":
            return self.claim()
        if action == "reset_host":
            # Called only after the host has removed its old runner container.
            state = self.aws.state()
            if state.get("lease_id"):
                self.release(state)
            return {"reset": True}
        if action in {"heartbeat", "finish"}:
            state = self.aws.state()
            if not event.get("lease_id") or state.get("lease_id") != event["lease_id"]:
                return {"cancel": True}
            if action == "finish":
                if event.get("started"):
                    self.aws.finished_locally(state["job_id"])
                elif self.aws.job_status(state["job_id"]) == "queued":
                    self.aws.unclaimed(state["job_id"])
                self.release(state)
                return {"released": True}
            self.aws.patch({"heartbeat": self.now}, expected_lease=event["lease_id"])
            return {"cancel": bool(state.get("cancel")),
                    "started": self.aws.job_status(state["job_id"]) in {"in_progress", "completed"}}
        raise ValueError("Unsupported action")


def handler(event, context):
    if os.environ.get("ENABLED") != "true":
        return {"disabled": True}
    aws = AWS()
    owner = uuid.uuid4().hex
    # This account's initial Lambda concurrency quota is 10; reserved
    # concurrency cannot be configured below AWS's unreserved minimum. A
    # conditional DynamoDB lock serializes stop/start/claim decisions instead.
    if not aws.acquire(owner):
        return {"busy": True}
    try:
        result = Controller(aws).handle(event)
        if event.get("action", "tick") == "tick":
            print(json.dumps(result))
        return result
    finally:
        aws.unlock(owner)
