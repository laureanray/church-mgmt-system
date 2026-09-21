# GitHub runners in AWS Singapore

This CloudFormation stack runs each GitHub Actions job in an ephemeral Ubuntu
CodeBuild container. It creates the CodeBuild project, the GitHub workflow-job
webhook, a restricted IAM role, and a log group with seven-day retention. No EC2
fleet, NAT gateway, custom VPC, S3 bucket, or Terraform state backend is needed.
The Tests job starts Postgres, GoTrue and nginx with Docker Compose, which needs
the project's privileged Docker mode.

The pattern is copied from `tailsintub-v0`, adapted to this repository's Bun
toolchain and single `Tests` workflow.

Workflows use GitHub-hosted runners until the repository variable
`AWS_CODEBUILD_PROJECT` is set. Their commands, required check names and GitHub
secrets remain the source of truth. The `quality` job has an 8-minute timeout
and `tests` 20 minutes; the project allows 30. Each job has a distinct runner
label (`job-quality`, `job-tests`) so one run's jobs never share a request.

Fork pull requests never reach CodeBuild. The build's service role can read the
repository PAT from Secrets Manager (CodeBuild needs it to clone and register
the runner), so running fork-controlled code there would let a malicious PR
exfiltrate an administration-capable credential. Both workflows route forks
to `ubuntu-latest` instead, where they fail on the exhausted quota rather than
run with the secret in reach. Same-repository branches are the trust boundary.

Two things differ from GitHub-hosted runners and are already handled:

- The CodeBuild image does not ship the `gh` CLI, so the coverage comment step
  uses `actions/github-script` and upserts a comment tagged
  `<!-- coverage-report -->`.
- Python 3.12 for `test:irm` still comes from `actions/setup-python`, which
  downloads a build for the runner's Ubuntu 22.04; the smoke workflow checks it.

## Cost and sizing

Singapore Linux x86 on-demand CodeBuild costs US$0.005/minute for Small and
US$0.01/minute for Medium as checked on 2026-09-13. The template uses Medium:
Storybook's build, Next's production build and Chromium all want the memory.
Recent GitHub-hosted runs of this workflow finished in roughly 2.5 minutes per
job, so a full run should cost a few US cents; measure actual CodeBuild
duration after switching. This is an estimate, not a spending guarantee.

There is no idle compute charge. Secrets Manager adds a recurring secret charge
(normally about US$0.40/month per secret), plus API usage. CloudWatch Logs,
applicable transfer, GitHub artifact storage and taxes may add charges.
GitHub's free-minute quota does not cover AWS compute. The project intentionally
has no project-level concurrency limit: CodeBuild rejects excess webhook
requests at that limit, leaving GitHub jobs waiting without runners. The
regional account quota provides queueing instead. Concurrency limits do not cap
monthly spending; use AWS Budgets for spend alerts.

If the `tailsintub-github-runner` stack already lives in this account, this
stack sits beside it: separate project, role, webhook, log group and secret.

## Authenticate from the terminal

Requirements: AWS CLI v2 supporting `aws login`, Python 3, and GitHub CLI `gh`.
Run commands from the repository root on Linux or macOS. Install the AWS CLI
using its [official installer](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

```bash
export AWS_PROFILE=default
export AWS_REGION=ap-southeast-1
aws login --profile "$AWS_PROFILE" --region ap-southeast-1
aws sts get-caller-identity
gh auth status
```

`aws login` opens a one-time browser sign-in. From SSH use `aws login --remote`.
If your account already uses IAM Identity Center, use its configured profile and
`aws sso login --profile <profile>` instead. Existing short-lived AWS credentials
also work; skip login if `aws sts get-caller-identity` already succeeds. Use an
IAM identity permitted to deploy CloudFormation, CodeBuild, IAM roles/policies,
CloudWatch Logs and Secrets Manager, not AWS root credentials.

## Store the repository credential

Create a dedicated [fine-grained GitHub PAT](https://github.com/settings/personal-access-tokens/new)
for **only** `laureanray/church-mgmt-system`, with an expiration date and these
repository permissions: Contents read; Commit statuses read/write; Webhooks
read/write; Administration read/write (required to register runners). Reuse of
the tailsintub PAT is deliberately not supported: that token is scoped to its
own repository.

```bash
python3 infra/github-runner/store-token.py --profile "$AWS_PROFILE"
```

Paste the token at the hidden terminal prompt, never into chat. The helper
sends it to Secrets Manager over stdin and prints only the secret ARN. It does
not place the token in command arguments, temporary files, or CloudFormation
parameters/state. It creates `church-mgmt/github-runner` under AWS-managed
encryption. Runner code can access its service role, including this secret:
restrict repository write access to trusted people.

Rotate before expiry with the same command plus `--rotate`, then revoke the old
PAT after checking the new one. No stack update is needed for rotation. The
helper's own tests run with `python3 -m unittest infra/github-runner/test_store_token.py`.

## Deploy the infrastructure

```bash
runner_secret_arn=$(aws secretsmanager describe-secret \
  --secret-id church-mgmt/github-runner --query ARN --output text)

aws cloudformation validate-template \
  --template-body file://infra/github-runner/template.yaml

aws cloudformation deploy \
  --stack-name church-mgmt-github-runner \
  --template-file infra/github-runner/template.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides GitHubSecretArn="$runner_secret_arn" \
  --no-fail-on-empty-changeset
```

Add `--no-execute-changeset` to preview changes without applying them. Normal
deployment creates/updates the webhook automatically; it appears under the
repository's Settings → Webhooks as an `api.github.com/repos/…/hooks/<id>` entry
and `aws codebuild batch-get-projects --names church-mgmt-ci` shows its URL. An account with zero
Medium on-demand concurrency needs an AWS quota increase. Inspect a failed
deployment with `aws cloudformation describe-stack-events --stack-name
church-mgmt-github-runner`; fix permissions/token scopes and retry. A stack in
`ROLLBACK_COMPLETE` must be deleted before recreating it. The secret is separate
and remains available for retries.

## Verify, then enable

To test before merging, set `AWS_CODEBUILD_SMOKE_PROJECT` to `church-mgmt-ci`
with `gh variable set`, then push a commit to the infrastructure PR. The smoke
workflow runs for same-repository PRs changing its workflow or runner files. It
enables only the smoke test; the Tests workflow keeps its current runner
setting. Fork PRs do not run the smoke test.

After the workflow exists on the default branch, GitHub also accepts manual
dispatch. It is safe to merge with `AWS_CODEBUILD_PROJECT` unset; the Tests
workflow keeps requesting GitHub-hosted runners, which may remain blocked by
the exhausted quota.

```bash
gh workflow run aws-runner-smoke.yaml --repo laureanray/church-mgmt-system \
  --ref main -f project=church-mgmt-ci
gh run list --repo laureanray/church-mgmt-system --workflow aws-runner-smoke.yaml --limit 1
gh run watch <run-id> --repo laureanray/church-mgmt-system --exit-status
```

The smoke job verifies Bun and Python installation, `docker compose` bringing
up the test stack, and launching Chromium. Once it succeeds, switch the Tests
workflow with one command:

```bash
gh variable set AWS_CODEBUILD_PROJECT --body church-mgmt-ci \
  --repo laureanray/church-mgmt-system
```

Watch the next Tests run to verify both jobs in AWS. Open PRs need this
workflow change in their own branches: older workflow versions keep asking for
GitHub-hosted runners even after the variable is set.

Inspect builds with `aws codebuild list-builds-for-project --project-name
church-mgmt-ci` and `aws codebuild batch-get-builds --ids <build-id>`. A job
stuck waiting usually indicates a project-name mismatch, webhook/auth failure,
expired PAT, exhausted concurrent-build quota, or queued builds. Never use a
GitHub-hosted launcher job to start this runner: that would depend on the quota
we are avoiding. The CodeBuild webhook is the launcher.

## Disable or remove

```bash
gh variable delete AWS_CODEBUILD_PROJECT --repo laureanray/church-mgmt-system
gh variable delete AWS_CODEBUILD_SMOKE_PROJECT --repo laureanray/church-mgmt-system
```

This restores GitHub-hosted routing for future jobs; it does not cancel active
jobs or restore GitHub's exhausted minutes. Cancel active GitHub runs and check
CodeBuild has stopped before deleting the stack:

```bash
aws cloudformation delete-stack --stack-name church-mgmt-github-runner
aws cloudformation wait stack-delete-complete --stack-name church-mgmt-github-runner
aws secretsmanager delete-secret --secret-id church-mgmt/github-runner \
  --recovery-window-in-days 7
```

Stack deletion removes the runner project/webhook, IAM role and log group.
Secret deletion is separate and recoverable for seven days. Revoke the dedicated
GitHub PAT when retiring this setup.

## References

- [CodeBuild runner setup and labels](https://docs.aws.amazon.com/codebuild/latest/userguide/action-runner.html)
- [Source-specific credentials](https://docs.aws.amazon.com/codebuild/latest/userguide/multiple-access-tokens.html)
- [Required GitHub token permissions](https://docs.aws.amazon.com/codebuild/latest/userguide/access-tokens-github.html)
- [AWS CLI login](https://docs.aws.amazon.com/cli/latest/reference/login/)
- [Singapore CodeBuild price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/CodeBuild/current/ap-southeast-1/index.json)
- [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/)
