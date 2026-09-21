#!/usr/bin/env bash
set -euo pipefail
mkdir -p /opt/shared-ci /var/log/journal
cat > /etc/shared-ci.env <<'ENV'
AWS_DEFAULT_REGION=${AWS::Region}
AWS_REGION=${AWS::Region}
ARTIFACT_BUCKET=${Artifacts}
CONTROLLER_FUNCTION=${AWS::StackName}-controller
PYTHONPATH=/opt/shared-ci/lib
ENV
chmod 0600 /etc/shared-ci.env

# The deployment uploads runtime files immediately after stack creation.
for attempt in $(seq 1 60); do
  if aws s3 cp s3://${Artifacts}/runtime/bootstrap.sh /opt/shared-ci/bootstrap.sh --only-show-errors; then break; fi
  sleep 10
done
test -s /opt/shared-ci/bootstrap.sh

cat > /etc/systemd/system/shared-ci-bootstrap.service <<'UNIT'
[Unit]
Description=Build the shared CI runner image
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
EnvironmentFile=/etc/shared-ci.env
ExecStart=/bin/bash /opt/shared-ci/bootstrap.sh
TimeoutStartSec=1800
[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/shared-ci-agent.service <<'UNIT'
[Unit]
Description=Shared ephemeral GitHub runner agent
After=shared-ci-bootstrap.service
Requires=shared-ci-bootstrap.service
[Service]
Type=simple
EnvironmentFile=/etc/shared-ci.env
ExecStart=/usr/bin/python3 /opt/shared-ci/runtime/agent.py
Restart=always
RestartSec=15
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now shared-ci-agent.service
