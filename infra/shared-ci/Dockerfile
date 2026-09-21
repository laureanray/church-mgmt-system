FROM ubuntu:22.04 AS git-build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl xz-utils libcurl4-openssl-dev \
    libexpat1-dev libssl-dev zlib1g-dev
RUN curl -fsSL https://www.kernel.org/pub/software/scm/git/git-2.55.0.tar.xz -o /tmp/git.tar.xz \
    && echo '457fdb04dc8728e007d4688695e6912e6f680727920f2a40bf11eacc17505357  /tmp/git.tar.xz' | sha256sum -c - \
    && tar -xJf /tmp/git.tar.xz -C /tmp \
    && make -C /tmp/git-2.55.0 -j2 prefix=/opt/git NO_GETTEXT=YesPlease NO_TCLTK=YesPlease NO_RUST=YesPlease install

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
ENV npm_config_store_dir=/home/runner/.local/share/pnpm/store
# Git 2.34 from the base distro lacks worktree --porcelain -z. Use the pinned
# upstream build; runtime libraries are already supplied by the distro git.
COPY --from=git-build /opt/git /opt/git
# /usr/local/bin is also in sudo's secure_path for the unprivileged runner.
RUN for binary in /opt/git/bin/*; do ln -s "$binary" "/usr/local/bin/$(basename "$binary")"; done
ENTRYPOINT ["/usr/local/bin/runner-entrypoint"]
