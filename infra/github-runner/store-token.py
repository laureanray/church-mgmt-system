#!/usr/bin/env python3
"""Store/rotate a GitHub PAT without putting it in argv, files, or shell history."""

import argparse
import getpass
import json
import re
import subprocess
import sys
import warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="default")
    parser.add_argument("--name", default="church-mgmt/github-runner")
    parser.add_argument("--rotate", action="store_true")
    args = parser.parse_args()
    aws = ["aws", "--profile", args.profile, "--region", "ap-southeast-1", "--no-cli-pager"]
    # Fail authentication before asking for a credential.
    subprocess.run(aws + ["sts", "get-caller-identity"], check=True, stdout=subprocess.DEVNULL)
    if not sys.stdin.isatty():
        parser.error("Run interactively so the token can be entered without echo.")
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        token = getpass.getpass("Repository-scoped GitHub PAT (hidden): ").strip()
    if not token:
        parser.error("Token must not be empty.")
    secret = json.dumps({"ServerType": "GITHUB", "AuthType": "PERSONAL_ACCESS_TOKEN", "Token": token})
    operation = "put-secret-value" if args.rotate else "create-secret"
    name_option = "--secret-id" if args.rotate else "--name"
    # The CLI can read --cli-input-json files more than once, which exhausts a
    # pipe. Parameter-file expansion for --secret-string reads the pipe once.
    result = subprocess.run(
        aws + ["secretsmanager", operation, name_option, args.name, "--secret-string", "file:///dev/stdin", "--query", "ARN", "--output", "text"],
        input=secret, text=True, capture_output=True,
    )
    if result.returncode:
        # AWS errors can echo request data; never forward them when handling a PAT.
        messages = {
            "ResourceExistsException": "Secret already exists; rerun with --rotate.",
            "ResourceNotFoundException": "Secret does not exist; omit --rotate to create it.",
            "AccessDeniedException": "AWS denied the secret write; check Secrets Manager permissions.",
            "InvalidRequestException": "AWS rejected the secret state; check whether it is scheduled for deletion.",
            "ExpiredTokenException": "AWS credentials expired; sign in again.",
            "ParamValidation": "AWS CLI rejected the parameters; check the CLI version and secret name.",
        }
        match = re.search(r"An error occurred \(([A-Za-z]+)\)", result.stderr)
        message = messages.get(match.group(1) if match else "", "Check AWS authentication, connectivity, and Secrets Manager permissions.")
        print("Secret write failed. " + message, file=sys.stderr)
        return result.returncode
    print(result.stdout.strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
