#!/usr/bin/env python3
"""Link irm on PATH to this checkout's worktree-aware launcher."""
from pathlib import Path
import os


def install(bin_dir, launcher):
    bin_dir.mkdir(parents=True, exist_ok=True)
    target = bin_dir / 'irm'
    if target.exists() and not target.is_symlink():
        raise ValueError(f'{target} is a regular file; move it aside before installing.')
    temporary = bin_dir / f'.irm-{os.getpid()}'
    try:
        temporary.symlink_to(launcher.resolve())
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return target


if __name__ == '__main__':
    target = install(Path.home() / '.local/bin', Path(__file__).with_name('launch.py'))
    print(f'{target} -> {target.resolve()}')
    print('irm now follows the saved active worktree; this checkout is the fallback.')
