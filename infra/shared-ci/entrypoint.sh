#!/usr/bin/env bash
set -euo pipefail

# A private Docker daemon for this job; never mount the host Docker socket.
# Cached images survive, but containers and database volumes do not.
dockerd --host=unix:///var/run/docker.sock --storage-driver=overlay2 > /var/log/dockerd.log 2>&1 &
docker_pid=$!
runner_pid=''
cleanup() {
  if [[ -n "$runner_pid" ]]; then kill -TERM "$runner_pid" 2>/dev/null || true; fi
  docker ps -aq | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker volume prune --all --force >/dev/null 2>&1 || true
  kill -TERM "$docker_pid" 2>/dev/null || true
  wait "$docker_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' TERM INT
ready=false
for attempt in {1..60}; do
  if docker info >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then cat /var/log/dockerd.log; exit 1; fi
docker ps -aq | xargs -r docker rm -f >/dev/null
docker volume prune --all --force >/dev/null
docker image prune --all --force --filter 'until=168h' >/dev/null

config="$JIT_CONFIG"
unset JIT_CONFIG
./run.sh --jitconfig "$config" &
runner_pid=$!
wait "$runner_pid"
