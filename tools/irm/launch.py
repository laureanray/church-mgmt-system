#!/usr/bin/env python3
"""Dispatch to the saved active worktree, with an installed-tree fallback."""
import json
import os
import platform
from pathlib import Path
import sys


def backend_path(config_path, fallback, command=None):
    if config_path.exists():
        cfg = json.loads(config_path.read_text())
        candidate = Path(cfg['worktree']) / 'tools/irm/irm.py'
        if candidate.is_file():
            manifest = candidate.with_name('capabilities.json')
            mode = cfg.get('network', 'auto')
            if manifest.is_file():
                capabilities = json.loads(manifest.read_text())
                if command in (None, 'pull', 'updates') and 'git-sync' not in capabilities.get('features', []):
                    return fallback / 'irm.py'
                if command == 'remote' and 'remote' not in capabilities.get('features', []):
                    return fallback / 'irm.py'
                if platform.system() in capabilities.get('platforms', []) and mode in capabilities.get('network_modes', []):
                    return candidate
            elif platform.system() == 'Linux' and mode in ('lan', 'tailscale') and command not in (None, 'pull', 'updates', 'remote'):
                # Legacy backends implement these two modes on Linux only.
                return candidate
            # Older worktrees can still run their app scripts using the installed
            # compatible manager; never drop macOS/auto support when switching.
    return fallback / 'irm.py'


def main():
    here = Path(__file__).resolve().parent
    backend = backend_path(Path.home() / '.config/irm/config.json', here, sys.argv[1] if len(sys.argv) > 1 else None)
    os.execv(sys.executable, [sys.executable, str(backend), *sys.argv[1:]])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        sys.exit(f'irm: {error}')
