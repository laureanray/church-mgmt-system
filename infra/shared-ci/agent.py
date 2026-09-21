"""EC2 host worker: one Docker-in-Docker, ephemeral GitHub runner at a time."""
import json
import logging
import os
import subprocess
import time
from pathlib import Path

import boto3

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
client = boto3.client("lambda")
FUNCTION = os.environ["CONTROLLER_FUNCTION"]
IMAGE = "shared-ci-runner:current"
CONTAINER = "shared-ci-job"


def invoke(action, **fields):
    for attempt in range(15):
        result = client.invoke(FunctionName=FUNCTION, Payload=json.dumps({"action": action, **fields}).encode())
        body = json.load(result["Payload"])
        if result.get("FunctionError"):
            # Responses can contain a JIT config; don't print response bodies.
            raise RuntimeError(f"Controller {action} failed")
        if not body.get("busy"):
            return body
        time.sleep(5)
    raise RuntimeError("Controller remained busy")


def docker(*args, check=True):
    return subprocess.run(["docker", *args], check=check, stdout=subprocess.DEVNULL)


def run_job(job):
    lease = job["lease_id"]
    env_file = Path("/run/shared-ci-job.env")
    # Never put the config in a command line, journal entry, or persistent disk.
    descriptor = os.open(env_file, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write(f"JIT_CONFIG={job['jit_config']}\n")
    repository = job["repo"].replace("/", "-")
    logging.info("Starting job %s in %s", job["job_id"], job["repo"])
    started = time.monotonic()
    saw_started = False
    try:
        docker("run", "-d", "--name", CONTAINER, "--privileged", "--init",
               "--memory", "7g", "--memory-swap", "7g", "--env-file", str(env_file),
               "--env", "CI=true",
               "--env", "AGENT_TOOLSDIRECTORY=/opt/hostedtoolcache",
               "--env", "RUNNER_TOOL_CACHE=/opt/hostedtoolcache",
               "--env", "ACTIONS_RUNNER_HOOK_JOB_STARTED=/usr/local/bin/mark-job-started.sh",
               "--volume", f"{repository}-docker:/var/lib/docker",
               "--volume", f"{repository}-tools:/opt/hostedtoolcache",
               "--volume", f"{repository}-browser-cache:/home/runner/.cache/ms-playwright",
               "--volume", f"{repository}-pnpm:/home/runner/.local/share/pnpm/store",
               "--volume", f"{repository}-bun:/home/runner/.bun/install/cache",
               IMAGE)
        env_file.unlink(missing_ok=True)
        while True:
            result = subprocess.run(["docker", "inspect", "--format", "{{.State.Running}}", CONTAINER],
                                    capture_output=True, text=True, check=True)
            if result.stdout.strip() != "true":
                break
            marker = subprocess.run(["docker", "exec", CONTAINER, "test", "-f", "/opt/actions-runner/.job-started"],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            saw_started = saw_started or marker.returncode == 0
            try:
                heartbeat = invoke("heartbeat", lease_id=lease, started=saw_started)
            except Exception:
                logging.warning("Heartbeat unavailable; keeping current job running")
                heartbeat = {}
            saw_started = saw_started or heartbeat.get("started", False)
            elapsed = time.monotonic() - started
            if heartbeat.get("cancel") or elapsed > 4200 or (elapsed > 300 and not saw_started):
                logging.warning("Stopping finished, cancelled, or expired runner job %s", job["job_id"])
                docker("stop", "--time", "30", CONTAINER, check=False)
                break
            time.sleep(15)
        subprocess.run(["docker", "logs", "--tail", "30", CONTAINER], check=False)
    finally:
        env_file.unlink(missing_ok=True)
        docker("rm", "-f", CONTAINER, check=False)
        # A brief Lambda update/outage must not strand the slot after Docker
        # has exited. No new job can be claimed until this release succeeds.
        while True:
            try:
                invoke("finish", lease_id=lease, started=saw_started)
                break
            except Exception:
                logging.warning("Retrying release for completed runner job %s", job["job_id"])
                time.sleep(15)
        logging.info("Released job %s", job["job_id"])


def main():
    # A stopped/rebooted host must not revive an old job beside a new runner.
    docker("rm", "-f", CONTAINER, check=False)
    invoke("reset_host")
    while True:
        try:
            job = invoke("claim")
            if job.get("lease_id"):
                run_job(job)
            else:
                time.sleep(15)
        except Exception as error:
            logging.error("Runner operation failed (%s); retrying", type(error).__name__)
            time.sleep(30)


if __name__ == "__main__":
    main()
