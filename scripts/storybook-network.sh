#!/usr/bin/env bash

# Serve Storybook to every device on your tailnet, for reviewing components on a
# real phone rather than a desktop viewport emulator.
#
# Shorter than its sibling `dev-network.sh`, and the reason is worth knowing:
# the Next dev server has to be *told* its own address, because the browser
# reads `NEXT_PUBLIC_SUPABASE_URL` and would otherwise call back to a
# `localhost` that means the phone. Storybook has no backend to point at — it
# only needs to stop binding to the loopback interface.

set -euo pipefail

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Error: tailscale is not installed." >&2
  exit 1
fi

tailscale_ip="$(tailscale ip -4 2>/dev/null | head -n 1)"

if [[ -z "$tailscale_ip" ]]; then
  echo "Error: Tailscale is not connected. Run 'tailscale up' first." >&2
  exit 1
fi

# Deliberately not `PORT`: that is what `dev-network.sh` reads, and anyone with
# it exported for the app would otherwise silently move Storybook too.
port="${STORYBOOK_PORT:-6006}"

# MagicDNS is nicer to type on a phone than an IP, so offer it when it resolves.
# The trailing dot Tailscale reports is a valid FQDN but reads as a typo.
magic_dns="$(tailscale status --json 2>/dev/null |
  sed -n 's/.*"DNSName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
  head -n 1 || true)"
magic_dns="${magic_dns%.}"

# Binding to 0.0.0.0 exposes Storybook on every interface, not just the tailnet
# one, and it would otherwise answer to any Host header. Naming the two the
# tailnet uses is what keeps a stray network — or a DNS-rebinding attack — from
# reaching it. `.storybook/main.ts` reads this.
export STORYBOOK_ALLOWED_HOSTS="localhost,127.0.0.1,${tailscale_ip}${magic_dns:+,${magic_dns}}"

echo
echo "IRM Ministries design system"
echo "Open from any device on your tailnet:"
echo "  http://${tailscale_ip}:${port}"
if [[ -n "$magic_dns" ]]; then
  echo "  http://${magic_dns}:${port}"
fi
echo

exec bun run storybook --host 0.0.0.0 --port "$port" --no-open
