#!/usr/bin/env python3
"""Deploy/update shared CI with AWS CLI; register signed GitHub webhooks safely."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import urllib.request

from template import build

ROOT = Path(__file__).resolve().parent
REPOSITORIES = {"laureanray/tailsintub-v0": "tailsintub/github-runner",
                "laureanray/church-mgmt-system": "church-mgmt/github-runner"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", default="ap-southeast-1")
    parser.add_argument("--profile", default="default")
    parser.add_argument("--stack", default="shared-ci")
    parser.add_argument("--enabled", choices=["true", "false"])
    parser.add_argument("--vpc-id")
    parser.add_argument("--subnet-id")
    args = parser.parse_args()
    cli = ["aws", "--profile", args.profile, "--region", args.region, "--no-cli-pager"]

    def aws(*command):
        result = subprocess.run(cli + list(command), check=True, capture_output=True, text=True)
        return json.loads(result.stdout) if result.stdout.strip() else {}

    aws("sts", "get-caller-identity")
    existing = subprocess.run(cli + ["cloudformation", "describe-stacks", "--stack-name", args.stack],
                              capture_output=True, text=True)
    parameters = {}
    if existing.returncode == 0:
        stack = json.loads(existing.stdout)["Stacks"][0]
        parameters = {p["ParameterKey"]: p["ParameterValue"] for p in stack.get("Parameters", [])}
    elif "does not exist" not in existing.stderr:
        raise RuntimeError("Cannot inspect the existing stack; check AWS credentials and permissions")
    vpc = args.vpc_id or parameters.get("VpcId")
    if not vpc:
        vpcs = aws("ec2", "describe-vpcs", "--filters", "Name=is-default,Values=true")["Vpcs"]
        if len(vpcs) != 1:
            raise RuntimeError("Specify --vpc-id: no unique default VPC")
        vpc = vpcs[0]["VpcId"]
    subnet = args.subnet_id or parameters.get("SubnetId")
    if not subnet:
        subnets = aws("ec2", "describe-subnets", "--filters", f"Name=vpc-id,Values={vpc}",
                      "Name=default-for-az,Values=true")["Subnets"]
        public = sorted((s for s in subnets if s["MapPublicIpOnLaunch"]), key=lambda s: s["AvailabilityZone"])
        if not public:
            raise RuntimeError("Specify --subnet-id: a public subnet with an internet gateway is required")
        subnet = public[0]["SubnetId"]
    image = parameters.get("ImageId") or aws("ssm", "get-parameter", "--name",
        "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64")["Parameter"]["Value"]
    secrets = {repo: aws("secretsmanager", "describe-secret", "--secret-id", name)["ARN"]
               for repo, name in REPOSITORIES.items()}
    values = {"VpcId": vpc, "SubnetId": subnet, "ImageId": image,
              "TailsSecretArn": secrets["laureanray/tailsintub-v0"],
              "ChurchSecretArn": secrets["laureanray/church-mgmt-system"],
              "Enabled": args.enabled or parameters.get("Enabled", "false")}
    with tempfile.TemporaryDirectory(prefix="shared-ci-deploy-") as directory:
        template = Path(directory) / "template.json"
        template.write_text(json.dumps(build()))
        aws("cloudformation", "validate-template", "--template-body", f"file://{template}")
        subprocess.run(cli + ["cloudformation", "deploy", "--stack-name", args.stack,
            "--template-file", str(template), "--capabilities", "CAPABILITY_IAM",
            "--no-fail-on-empty-changeset", "--parameter-overrides",
            *[f"{key}={value}" for key, value in values.items()]], check=True)
        stack = aws("cloudformation", "describe-stacks", "--stack-name", args.stack)["Stacks"][0]
        outputs = {output["OutputKey"]: output["OutputValue"] for output in stack["Outputs"]}
        for filename in ["agent.py", "Dockerfile", "entrypoint.sh"]:
            subprocess.run(cli + ["s3", "cp", str(ROOT / filename),
                f"s3://{outputs['ArtifactBucket']}/runtime/{filename}", "--only-show-errors"], check=True)
        image_version = Path(directory) / "image-version"
        image_version.write_text(hashlib.sha256(
            (ROOT / "Dockerfile").read_bytes() + (ROOT / "entrypoint.sh").read_bytes()).hexdigest())
        subprocess.run(cli + ["s3", "cp", str(image_version),
            f"s3://{outputs['ArtifactBucket']}/runtime/image-version", "--only-show-errors"], check=True)

    # Publish bootstrap last: user-data can start it as soon as it appears.
    subprocess.run(cli + ["s3", "cp", str(ROOT / "bootstrap.sh"),
        f"s3://{outputs['ArtifactBucket']}/runtime/bootstrap.sh", "--only-show-errors"], check=True)

    # Credentials stay in process memory, never argv, temporary files, or logs.
    webhook_secret = aws("secretsmanager", "get-secret-value", "--secret-id", outputs["WebhookSecretArn"])["SecretString"]
    hooks = {}
    for repo, secret_arn in secrets.items():
        token = json.loads(aws("secretsmanager", "get-secret-value", "--secret-id", secret_arn)["SecretString"])["Token"]

        def github(path, method="GET", data=None):
            request = urllib.request.Request(f"https://api.github.com/repos/{repo}{path}", method=method,
                data=json.dumps(data).encode() if data is not None else None,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                         "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10"})
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                raise RuntimeError(f"GitHub webhook operation failed for {repo}: HTTP {error.code}") from None

        current = next((hook for hook in github("/hooks")
                        if hook["config"].get("url") == outputs["WebhookUrl"]), None)
        payload = {"name": "web", "active": True, "events": ["workflow_job", "workflow_run"],
                   "config": {"url": outputs["WebhookUrl"], "content_type": "json",
                              "secret": webhook_secret, "insecure_ssl": "0"}}
        hook = github(f"/hooks/{current['id']}" if current else "/hooks", "PATCH" if current else "POST", payload)
        hooks[repo] = {"N": str(hook["id"])}
        print(f"Configured signed webhook for {repo}")
    aws("dynamodb", "put-item", "--table-name", outputs["TableName"],
        "--item", json.dumps({"id": {"S": "hooks"}, "hooks": {"M": hooks}}))
    print(json.dumps(outputs, indent=2))


if __name__ == "__main__":
    main()
