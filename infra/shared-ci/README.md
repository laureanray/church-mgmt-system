# Shared EC2 CI runner

One `c6i.xlarge` (4 vCPUs, 8 GiB RAM) in Singapore serves
`laureanray/church-mgmt-system` and `laureanray/tailsintub-v0`. It has a 100 GB
encrypted gp3 root disk, a public address while running, no inbound ports, and
SSM administration. There is no NAT gateway or reserved Elastic IP.

## How it starts and stops

Signed GitHub `workflow_job` and `workflow_run` webhooks populate a DynamoDB
queue. A Lambda checks it every minute, retries failed webhook deliveries, and
starts the stopped VM when an eligible job is waiting. It checks source-repo
metadata before trusting PR jobs; fork and `pull_request_target` runs cannot
enter the runner queue. The webhooks use an HMAC secret; GitHub PATs are scoped
to their existing individual repositories and stay inside the controller.

The host requests a just-in-time, single-job runner configuration from Lambda.
A unique label targets that job. It runs in a disposable Ubuntu 22.04 container
with its own Docker daemon. Only **one job across both repositories** runs at a
time; the controller alternates repositories when both have work. Containers,
database volumes, and checkouts are discarded after each job. Docker images,
browser downloads, package stores, and tool installations persist in separate
per-repository cache volumes. Job containers cannot reach EC2 instance metadata.

After the queue and active runner are empty for 10 minutes, Lambda stops EC2.
The next job waits for the next queue check and VM boot. A controller lock
prevents a claim racing an idle-stop decision. A watchdog stops a wedged host
after 80 minutes, beyond the existing job timeouts, and does not release its
slot until EC2 is stopped. Three unclaimed runner attempts stop automatic
retries for that job; inspect the controller/host logs before rerunning it.
A host that cannot start any queued job within 15 minutes is stopped and the
controller pauses, preventing a broken bootstrap or expired PAT from running
up an indefinite compute bill. After fixing the cause, remove `paused` and
`waiting_since` from the table's `control` item to resume scheduling.

All existing GitHub job names, test commands, coverage checks/comments, reports,
and artifacts stay in their workflows. Sharing a machine reduces parallelism:
full workflows take longer to finish than with many CodeBuild containers.

## Costs

The verified Singapore on-demand rate on 2026-09-21 is $0.196 per running hour.
The 100 GB gp3 disk is about $9.60/month even while EC2 is stopped. Public IPv4
is additional while allocated; the generated webhook secret is about $0.40/month.
Lambda, DynamoDB, S3, logs, transfer, and taxes are separate. Ten idle minutes
between bursts count as running time. This is not a hard monthly spending cap.

## Deploy through AWS CLI

Requires AWS CLI v2, Python 3, and authenticated AWS administration access. The
existing Secrets Manager values `tailsintub/github-runner` and
`church-mgmt/github-runner` must contain their CodeBuild-format JSON `Token`,
with repository Administration write and Webhooks read/write permissions.
Actions read permission is not required.

```sh
aws login --region ap-southeast-1
python3 -m unittest discover -s infra/shared-ci -p 'test_*.py'
python3 infra/shared-ci/deploy.py --enabled false
```

The script generates and validates CloudFormation, creates the host and
controller, uploads the runtime, and configures both signed webhooks. Tokens and
the webhook key stay in process memory and are never placed in argv or files.
The initial Docker image build can take several minutes. Inspect it with SSM:

```sh
aws ssm send-command --region ap-southeast-1 --instance-ids INSTANCE_ID \
  --document-name AWS-RunShellScript \
  --parameters '{"commands":["systemctl status shared-ci-agent --no-pager","journalctl -u shared-ci-bootstrap -n 30 --no-pager"]}'
```

Once the image is ready, enable the controller:

```sh
python3 infra/shared-ci/deploy.py --enabled true
```

Updates preserve the existing AMI, VPC, subnet, and enabled state unless
explicitly changed. Runtime files are fetched on boot. For a runtime/image
update on a running host, first verify there is no active lease or job, then
restart the bootstrap and agent services through SSM. Never restart them over
a running workflow.

## Routing and rollout

In each repository, set `AWS_EC2_RUNNER_ENABLED=true` to select the new labels
in migrated workflows. During validation the existing `AWS_CODEBUILD_PROJECT`
and smoke-project variables remain available for rollback. The code change must be on a branch
for that branch's workflows to use EC2; setting the variable alone does not
modify old workflow files on main.

```sh
gh variable set AWS_EC2_RUNNER_ENABLED --body true --repo laureanray/church-mgmt-system
gh variable set AWS_EC2_RUNNER_ENABLED --body true --repo laureanray/tailsintub-v0
gh workflow run aws-runner-smoke.yaml --repo laureanray/church-mgmt-system --ref BRANCH
gh workflow run aws-runner-smoke.yaml --repo laureanray/tailsintub-v0 --ref BRANCH
```

Validate both full workflows, then verify idle stop and a subsequent wake-up.
Keep the migration pull requests separate from infrastructure activation until
their checks are green. Only reviewed/merged workflows change main's routing.
The Tails migration also carries the prior CI cost optimizations.

## Diagnostics and rollback

CloudFormation stack `shared-ci` exposes the instance ID, table, artifact bucket,
controller function, and webhook URL. Controller and receiver logs are retained
for seven days in `/aws/lambda/shared-ci-controller` and
`/aws/lambda/shared-ci-webhook`. Host diagnostics are in the systemd journal on
the persistent disk; ordinary job logs and reports remain in GitHub Actions.
Do not print Docker container environment/configuration or Lambda `claim`
responses: they contain short-lived JIT runner credentials.

To route future jobs back to CodeBuild, set `AWS_EC2_RUNNER_ENABLED=false` in
both repositories **while the CodeBuild projects still exist**. Let already
queued EC2 jobs drain, or cancel those workflow runs explicitly. Disable the
controller only after draining, then stop EC2.

After both full workflows, idle stop, wake-up, and main's routing are validated,
the old `tailsintub-github-runner` and `church-mgmt-github-runner` stacks can be
deleted and their CodeBuild routing variables removed. Keep the existing
`tailsintub/github-runner` and `church-mgmt/github-runner` credential secrets:
the EC2 controller uses them too. The old templates stay in each repository;
after retirement, redeploy those stacks and restore the CodeBuild variables
before selecting CodeBuild as a rollback target.

Stopping EC2 retains the disk and cached images; deleting the stack destroys
the VM's disk. Repository code and GitHub reports are not stored only on EC2.
