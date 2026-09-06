#!/usr/bin/env bash

set -euo pipefail

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Error: tailscale is not installed." >&2
  exit 1
fi

tailscale_ip="$(tailscale ip -4 2>/dev/null | head -n 1)"
dev_port="${PORT:-3000}"

if [[ -z "$tailscale_ip" ]]; then
  echo "Error: Tailscale is not connected. Run 'tailscale up' first." >&2
  exit 1
fi

export NEXT_PUBLIC_APP_URL="http://${tailscale_ip}:${dev_port}"
export NEXT_PUBLIC_SUPABASE_URL="http://${tailscale_ip}:54421"

echo
echo "IRM Ministries development server"
echo "Open from any device on your tailnet:"
echo "  ${NEXT_PUBLIC_APP_URL}"
echo

exec bun run dev --hostname 0.0.0.0 --port "$dev_port"
