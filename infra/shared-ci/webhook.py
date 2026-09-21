"""Authenticated GitHub event receiver. No EC2 or GitHub administrative access."""
import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone

ALLOWED_EVENTS = {"push", "pull_request", "workflow_dispatch", "schedule"}


def trusted_run(run, repo):
    return run.get("event") in ALLOWED_EVENTS and (
        run.get("event") != "pull_request"
        or (run.get("head_repository") or {}).get("full_name") == repo
    )


def decode(event, secret):
    body = event.get("body") or ""
    raw = base64.b64decode(body) if event.get("isBase64Encoded") else body.encode()
    headers = {key.lower(): value for key, value in event.get("headers", {}).items()}
    expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(headers.get("x-hub-signature-256", ""), expected):
        raise ValueError("Invalid signature")
    return json.loads(raw), headers


def apply_event(table, payload, headers, repositories, now):
    repo = payload.get("repository", {}).get("full_name")
    if repo not in repositories:
        raise ValueError("Repository not allowed")
    kind = headers.get("x-github-event")
    ttl = now + 604800
    if kind == "workflow_run":
        run = payload["workflow_run"]
        table.put_item(Item={"id": f"run#{run['id']}", "repo": repo,
                            "trusted": trusted_run(run, repo), "expires_at": ttl})
    elif kind == "workflow_job":
        job = payload["workflow_job"]
        status = job["status"]
        if status in {"queued", "in_progress", "completed"} and any(
            label.startswith("ec2-shared-ci-") for label in job.get("labels", [])
        ):
            rank = {"queued": 0, "in_progress": 1, "completed": 2}[status]
            try:
                table.update_item(
                    Key={"id": f"job#{job['id']}"},
                    UpdateExpression="SET #s = :s, event_rank = :rank, repo = :repo, job_id = :job, "
                                     "run_id = :run, labels = :labels, #n = :name, created_at = :created, expires_at = :ttl",
                    ConditionExpression="attribute_not_exists(event_rank) OR event_rank <= :rank",
                    ExpressionAttributeNames={"#s": "status", "#n": "name"},
                    ExpressionAttributeValues={":s": status, ":rank": rank, ":repo": repo,
                        ":job": job["id"], ":run": job["run_id"], ":labels": job["labels"],
                        ":name": job["name"], ":created": job.get("created_at") or datetime.fromtimestamp(now, timezone.utc).isoformat(),
                        ":ttl": ttl},
                )
            except table.meta.client.exceptions.ConditionalCheckFailedException:
                pass  # Old/delayed events cannot resurrect completed work.
    delivery = headers.get("x-github-delivery")
    if delivery:
        table.update_item(Key={"id": "delivery#" + delivery},
                          UpdateExpression="SET received = :yes, expires_at = :ttl",
                          ExpressionAttributeValues={":yes": True, ":ttl": ttl})


def handler(event, context):
    import boto3
    try:
        secret = boto3.client("secretsmanager").get_secret_value(
            SecretId=os.environ["WEBHOOK_SECRET_ARN"])["SecretString"]
        payload, headers = decode(event, secret)
        apply_event(boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"]),
                    payload, headers, json.loads(os.environ["REPOSITORIES"]), int(time.time()))
    except (ValueError, KeyError, TypeError):
        return {"statusCode": 403, "body": "Rejected"}
    return {"statusCode": 200, "body": "Accepted"}
