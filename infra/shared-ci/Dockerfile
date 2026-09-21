FROM node:24-bookworm AS node
FROM ubuntu:22.04
COPY --from=node /usr/local/ /usr/local/

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git jq sudo unzip zip zstd python3 python3-venv \
    libicu70 libssl3 libkrb5-3 zlib1g liblttng-ust1 libunwind8 iptables \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
    && echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu jammy stable' > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
       docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

WORKDIR /opt/actions-runner
ARG RUNNER_VERSION=2.337.0
ARG RUNNER_SHA256=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613
RUN curl -fsSL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" -o /tmp/runner.tgz \
    && echo "${RUNNER_SHA256}  /tmp/runner.tgz" | sha256sum -c - \
    && tar xzf /tmp/runner.tgz && rm /tmp/runner.tgz \
    && ./bin/installdependencies.sh

# System dependencies persist in the image. Each repository's pinned browser
# binary is installed by its existing workflow into a persistent cache volume.
RUN npx --yes playwright@1.63.0 install-deps chromium
RUN useradd --create-home --uid 1001 --groups docker runner \
    && echo 'runner ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/runner \
    && chmod 0440 /etc/sudoers.d/runner \
    && chown -R runner:runner /opt/actions-runner
COPY entrypoint.sh /usr/local/bin/runner-entrypoint
RUN chmod 0755 /usr/local/bin/runner-entrypoint
RUN printf '#!/bin/sh\ntouch /opt/actions-runner/.job-started\n' > /usr/local/bin/mark-job-started.sh \
    && chmod 0755 /usr/local/bin/mark-job-started.sh
ENTRYPOINT ["/usr/local/bin/runner-entrypoint"]
