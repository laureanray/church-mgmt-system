#!/usr/bin/env bash
set -euo pipefail
source /etc/shared-ci.env
# The host AWS CLI uses Amazon Linux's system Python, while the worker SDK
# uses Python 3.12. Do not inject the worker's libraries into the AWS CLI/dnf.
unset PYTHONPATH
mkdir -p /opt/shared-ci/runtime
# These files are tiny. Always fetch them: size/mtime-based sync can otherwise
# leave an old same-length image digest beside newly downloaded build inputs.
aws s3 cp "s3://${ARTIFACT_BUCKET}/runtime/" /opt/shared-ci/runtime/ --recursive --only-show-errors

if ! command -v docker >/dev/null; then
  dnf install -y docker
fi
dnf install -y python3.12 python3.12-pip
systemctl enable --now docker

# Jobs have no access to the instance role or its authenticated controller API.
iptables -C DOCKER-USER -d 169.254.169.254/32 -j REJECT 2>/dev/null \
  || iptables -I DOCKER-USER 1 -d 169.254.169.254/32 -j REJECT

if [[ ! -f /opt/shared-ci/lib/boto3/__init__.py ]]; then
  python3.12 -m pip install --target /opt/shared-ci/lib boto3==1.43.98
fi
version=$(cat /opt/shared-ci/runtime/image-version)
installed=$(cat /opt/shared-ci/image-version 2>/dev/null || true)
if [[ "$version" != "$installed" ]] || ! docker image inspect shared-ci-runner:current >/dev/null 2>&1; then
  docker build --tag shared-ci-runner:current /opt/shared-ci/runtime
  printf '%s' "$version" > /opt/shared-ci/image-version
fi
echo 'Shared CI runner image is ready.'

# Keep an initially bootstrapped service in step with the supported Python.
sed -i 's|ExecStart=/usr/bin/python3 |ExecStart=/usr/bin/python3.12 |' /etc/systemd/system/shared-ci-agent.service
systemctl daemon-reload
