#!/usr/bin/env python3
"""Work on a remote Linux host over SSH: its dashboard with the app's ports
forwarded here, and laptop worktrees mirrored onto it.

`irm remote sync` copies this file to the host and runs it there
(`info`, `receive`), so the receiving half imports nothing outside the
standard library and never depends on the host's irm version.
"""
import io
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import tomllib

SESSION = 'irm-remote'
REMOTE_SCRIPT = '~/.cache/irm/remote.py'
# Own connection rather than a shared ControlMaster: forwards requested through a
# mux client live on the master and outlast the window. LogLevel=ERROR keeps
# refused-forward chatter (a browser retrying mid-restart) off the dashboard.
SSH_OPTS = ['-o', 'ConnectTimeout=6', '-o', 'ControlMaster=no', '-o', 'ControlPath=none',
            '-o', 'ServerAliveInterval=15', '-o', 'ExitOnForwardFailure=no', '-o', 'LogLevel=ERROR']
PROBE_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=4']


# ── shared ───────────────────────────────────────────────────────────────────

def worktree_path(cfg, slug):
    """Beside the primary checkout, or under worktree_root when one is configured."""
    root = cfg.get('worktree_root')
    if root:
        return Path(root).expanduser() / slug
    primary = Path(cfg['repo'])
    return primary.parent / (primary.name + '-' + slug)


def memory_dir(repo, config_dir=None):
    """Claude Code keys project memory by the checkout path with every other character dashed."""
    base = Path(config_dir or os.environ.get('CLAUDE_CONFIG_DIR') or Path.home() / '.claude')
    return base / 'projects' / re.sub(r'[^A-Za-z0-9]', '-', str(repo)) / 'memory'


def git(tree, *args, check=True):
    return subprocess.run(['git', '-C', str(tree), *args], check=check, text=True,
                          capture_output=True).stdout.strip()


# ── laptop: host and ports ───────────────────────────────────────────────────

def hosts(cfg):
    override = os.environ.get('IRM_REMOTE_HOST')
    return [override] if override else list(cfg.get('remote_hosts', []))


def choose_host(cfg):
    """First candidate that answers SSH: list the LAN name before the Tailscale one."""
    candidates = hosts(cfg)
    if not candidates:
        raise ValueError('No remote host configured. Run irm remote host user@lan-name [user@tailscale-name].')
    for host in candidates:
        try:
            probe = subprocess.run(['ssh', *PROBE_OPTS, host, 'true'], stdin=subprocess.DEVNULL,
                                   capture_output=True, timeout=10)
        except subprocess.TimeoutExpired:
            continue
        if probe.returncode == 0:
            return host
    raise ValueError(f'No remote host reachable over SSH: {", ".join(candidates)}')


def forward_ports(tree):
    """(local, remote, required) triples. The app and the Supabase API are required:
    the browser calls both, so a local service on either port would answer instead."""
    settings = tomllib.loads((tree / 'supabase/config.toml').read_text())
    api, db = settings['api']['port'], settings['db']['port']
    required = {3000, api}
    raw = os.environ.get('IRM_REMOTE_PORTS')
    if raw:
        pairs = []
        for entry in filter(None, (part.strip() for part in raw.split(','))):
            local, _, remote = entry.partition(':')
            pairs.append((int(local), int(remote or local)))
    else:
        # Postgres lands 10 ports up so a local database can keep its own port.
        pairs = [(3000, 3000), (6006, 6006), (api, api), (settings['studio']['port'],) * 2,
                 (settings['local_smtp']['port'],) * 2, (db + 10, db)]
    for local, remote in pairs:
        # The browser is sent to these exact ports, so a remap would bypass the tunnel.
        if remote in required and local != remote:
            raise ValueError(f'IRM_REMOTE_PORTS cannot remap port {remote}; the browser always uses it. Forward it as {remote}.')
    return [(local, remote, remote in required) for local, remote in pairs]


def plan_ports(tree, occupied):
    forwards, skipped, blocking = [], [], []
    for local, remote, required in forward_ports(tree):
        if not occupied(local):
            forwards.append((local, remote))
        elif required:
            blocking.append(local)
        else:
            skipped.append(local)
    return forwards, skipped, blocking


def blocking_message(ports):
    return (f'Port {", ".join(map(str, ports))} is in use on this machine, so the browser would reach it '
            'instead of the remote. Stop local services first: irm stop all && irm supabase stop')


def dashboard_command(host, forwards):
    # Loopback on the host: services bind 127.0.0.1 in local mode and reach the
    # browser only through these forwards, which keeps it a secure context (camera).
    remote = f"IRM_NETWORK=local COLORTERM={shlex.quote(os.environ.get('COLORTERM', 'truecolor'))} irm"
    tunnels = [arg for local, remote_port in forwards for arg in ('-L', f'{local}:127.0.0.1:{remote_port}')]
    return ['ssh', '-t', *SSH_OPTS, *tunnels, host, remote]


def tmux(*args):
    return subprocess.run(['tmux', *args], capture_output=True, text=True)


def session_open():
    return shutil.which('tmux') is not None and tmux('has-session', '-t', '=' + SESSION).returncode == 0


def open_dashboard(cfg, tree, occupied, loop_command):
    if os.environ.get('TMUX') and session_open():
        tmux('switch-client', '-t', '=' + SESSION)
        return
    host = choose_host(cfg)
    forwards, skipped, blocking = plan_ports(tree, occupied)
    if blocking:
        raise ValueError(blocking_message(blocking))
    if not os.environ.get('TMUX'):
        if skipped:
            print(f'Not forwarded (in use here): {", ".join(map(str, skipped))}')
        command = dashboard_command(host, forwards)
        os.execvp(command[0], command)
    tmux('new-session', '-d', '-s', SESSION, '-n', 'irm', shlex.join(loop_command))
    tmux('set-option', '-t', '=' + SESSION, 'detach-on-destroy', 'previous')
    tmux('switch-client', '-t', '=' + SESSION)


def dashboard_loop(cfg, tree, occupied):
    """Runs in the irm-remote tmux window. Quitting the dashboard (q) returns to the
    previous session and reconnects in the background, ready for next time."""
    while True:
        try:
            host = choose_host(cfg)
            forwards, skipped, blocking = plan_ports(tree, occupied)
            if blocking:
                raise ValueError(blocking_message(blocking))
        except ValueError as error:
            print(error)
        else:
            label = 'irm ⇄' + ','.join(str(local) for local, _ in forwards)
            tmux('rename-window', '-t', os.environ.get('TMUX_PANE', SESSION), label)
            if skipped:
                tmux('display-message', '-d', '6000', f'irm remote: {", ".join(map(str, skipped))} in use here, not forwarded')
            code = subprocess.run(dashboard_command(host, forwards)).returncode
            if code == 0:
                tmux('switch-client', '-l')
                continue
            print(f'\nirm on {host} exited ({code}).')
        try:
            input('Return to reconnect, Ctrl-D to close: ')
        except EOFError:
            return


def kill():
    if session_open():
        tmux('kill-session', '-t', '=' + SESSION)
        print('Closed irm-remote; services on the remote keep running.')
    else:
        print('irm-remote is not open.')


# ── laptop: sync ─────────────────────────────────────────────────────────────

def collect(registered, targets):
    """One entry per target worktree: its commit plus uncommitted work, as files."""
    primary = Path(registered[0][0])
    entries = []
    for path, branch in targets:
        tree = Path(path)
        if tree == primary:
            print(f'Skipped {tree}: the primary checkout follows origin on the remote.', flush=True)
            continue
        if branch == 'detached':
            print(f'Skipped {tree}: detached HEAD.', flush=True)
            continue
        slug = tree.name.removeprefix(primary.name + '-')
        patch = subprocess.run(['git', '-C', str(tree), 'diff', '--binary', 'HEAD'],
                               check=True, capture_output=True).stdout
        # Entries ending in / are nested repositories (untracked worktrees): never shipped.
        untracked = [name for name in git(tree, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')
                     if name and not name.endswith('/')]
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode='w') as tar:
            for name in untracked:
                tar.add(tree / name, arcname=name, recursive=False)
        entries.append({'slug': slug, 'branch': branch, 'sha': git(tree, 'rev-parse', 'HEAD'),
                        'patch': patch, 'untracked': archive.getvalue() if untracked else b'',
                        'changes': len(git(tree, 'status', '--porcelain').splitlines())})
    return entries


def payload(entries, memory=None, select=None):
    spec = {'select': select, 'trees': [{k: e[k] for k in ('slug', 'branch', 'sha')} for e in entries]}
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w') as tar:
        def add(name, data):
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mtime = int(time.time())
            tar.addfile(info, io.BytesIO(data))
        add('spec.json', json.dumps(spec).encode())
        for entry in entries:
            add(f"trees/{entry['slug']}/tracked.patch", entry['patch'])
            add(f"trees/{entry['slug']}/untracked.tar", entry['untracked'])
        if memory and memory.is_dir():
            for file in sorted(memory.glob('*.md')):
                add(f'memory/{file.name}', file.read_bytes())
    return buffer.getvalue()


def ssh_run(host, command, **kwargs):
    return subprocess.run(['ssh', *PROBE_OPTS, host, command], **kwargs)


def sync(cfg, registered, targets, selected, force=False, memory=True, code=True):
    host = choose_host(cfg)
    primary = Path(registered[0][0])
    entries = collect(registered, targets) if code else []
    if code and not entries:
        raise ValueError('Nothing to sync: name a worktree other than the primary checkout, or use --all.')
    ssh_run(host, f'mkdir -p ~/.cache/irm && cat > {REMOTE_SCRIPT}', input=Path(__file__).read_bytes(),
            check=True, capture_output=True)
    info = json.loads(ssh_run(host, f'python3 {REMOTE_SCRIPT} info', check=True,
                              capture_output=True, text=True).stdout)
    print(f"Remote: {host} · {info['repo']}", flush=True)
    if entries:
        # Commits travel straight over SSH as laptop/<branch>, so unpushed work arrives too.
        refspecs = [f"+{e['sha']}:refs/remotes/laptop/{e['branch']}" for e in entries]
        subprocess.run(['git', '-C', str(primary), 'push', '--quiet', '--force', '--no-verify',
                        f"{host}:{info['repo']}", *refspecs], check=True)
        for entry in entries:
            if entry['changes']:
                print(f"  {entry['slug']}: {entry['changes']} uncommitted file(s) mirrored", flush=True)
    select = next((Path(p).name.removeprefix(primary.name + '-') for p, _ in targets if Path(p) == selected), None)
    data = payload(entries, memory_dir(primary) if memory else None, select if entries else None)
    result = ssh_run(host, f'python3 {REMOTE_SCRIPT} receive' + (' --force' if force else ''), input=data)
    if result.returncode:
        raise ValueError(f'Remote receive failed ({result.returncode}); see the output above.')


# ── remote host: receive ─────────────────────────────────────────────────────

CONFIG = Path.home() / '.config/irm/config.json'
STATE = Path.home() / '.cache/irm/sync'


def warn(message):
    print(f'  [warn] {message}')


def tree_state(tree):
    """HEAD plus a hash of the whole working tree (tracked + untracked, not ignored)."""
    with tempfile.TemporaryDirectory() as temp:
        index = Path(temp) / 'index'
        current = Path(git(tree, 'rev-parse', '--path-format=absolute', '--git-path', 'index'))
        if current.is_file():
            shutil.copy(current, index)
        env = {**os.environ, 'GIT_INDEX_FILE': str(index)}
        subprocess.run(['git', '-C', str(tree), 'add', '-A'], env=env, capture_output=True)
        written = subprocess.run(['git', '-C', str(tree), 'write-tree'], env=env, check=True,
                                 capture_output=True, text=True).stdout.strip()
    return f"{git(tree, 'rev-parse', 'HEAD')} {written}"


def own_commits(repo, ref, sha):
    """Commits on ref that are on neither the laptop nor any origin branch."""
    return git(repo, 'rev-list', ref, '--not', sha, '--remotes=origin', '--remotes=laptop', check=False)


def registered_trees(repo):
    found, path = {}, None
    for line in git(repo, 'worktree', 'list', '--porcelain').splitlines():
        if line.startswith('worktree '):
            path = Path(line[9:])
        elif line.startswith('branch '):
            found[line[7:].removeprefix('refs/heads/')] = path
    return found


def bun_install(tree):
    version_file = tree / '.bun-version'
    command = ['bun']
    if version_file.is_file():
        version = version_file.read_text().strip()
        installed = subprocess.run(['bun', '--version'], capture_output=True, text=True)
        if installed.returncode or installed.stdout.strip() != version:
            command = ['bunx', f'bun@{version}']
    result = subprocess.run([*command, 'install', '--frozen-lockfile'], cwd=tree,
                            capture_output=True, text=True)
    if result.returncode:
        print(result.stderr.strip()[-2000:])
        raise subprocess.SubprocessError


def prepare(tree, cfg):
    """What irm setup does, for a worktree that is not the selected one."""
    env, source = tree / '.env', cfg.get('env_source')
    if not os.path.lexists(env) and source and Path(source).is_file():
        env.symlink_to(source)
    if (tree / 'bun.lock').is_file() and not (tree / 'node_modules/next/package.json').is_file():
        print(f'  installing dependencies in {tree.name}…', flush=True)
        try:
            bun_install(tree)
        except (OSError, subprocess.SubprocessError):
            warn(f'{tree.name}: bun install failed; run it there by hand')


def receive_tree(repo, cfg, entry, source, force):
    slug, branch, sha = entry['slug'], entry['branch'], entry['sha']
    existing = registered_trees(repo).get(branch)
    tree = existing or worktree_path(cfg, slug)
    if not force and git(repo, 'rev-parse', '--verify', '--quiet', 'refs/heads/' + branch, check=False) \
            and own_commits(repo, 'refs/heads/' + branch, sha):
        warn(f'{slug}: {branch} has commits made on this host that are not on the laptop or origin — skipped (--force overwrites)')
        return None
    if existing is None:
        if tree.exists():
            warn(f'{slug}: {tree} exists but is not a worktree of {repo} — skipped')
            return None
        tree.parent.mkdir(parents=True, exist_ok=True)
        git(repo, 'worktree', 'add', '--quiet', '--no-track', '-B', branch, str(tree), sha)
        print(f'  created {tree}')
    elif not force and git(tree, 'status', '--porcelain'):
        # Uncommitted work is ours only if it is exactly what the last sync left.
        record = STATE / slug
        if not record.is_file() or tree_state(tree) != record.read_text().strip():
            warn(f'{slug}: has uncommitted edits made on this host — skipped (--force overwrites)')
            return None
    git(tree, 'reset', '--quiet', '--hard')
    git(tree, 'clean', '-fdq')  # never -x: .env and node_modules are ignored and stay
    git(tree, 'checkout', '--quiet', '-B', branch, sha)
    if git(tree, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/' + branch, check=False):
        git(tree, 'branch', '--quiet', '-u', 'origin/' + branch, branch, check=False)
    patch = source / 'tracked.patch'
    if patch.stat().st_size:
        git(tree, 'apply', '--binary', '--whitespace=nowarn', str(patch))
    untracked = source / 'untracked.tar'
    if untracked.stat().st_size:
        with tarfile.open(untracked) as tar:
            tar.extractall(tree, filter='data')
    STATE.mkdir(parents=True, exist_ok=True)
    (STATE / slug).write_text(tree_state(tree) + '\n')
    changes = len(git(tree, 'status', '--porcelain').splitlines())
    print(f"  {slug:40} {sha[:10]} [{branch}]" + (f' +{changes} uncommitted' if changes else ''))
    prepare(tree, cfg)
    return tree


def merge_memory(source, target):
    """One way, no deletes. MEMORY.md is an index, so laptop entries (not headings) are appended to it."""
    target.mkdir(parents=True, exist_ok=True)
    count = 0
    for file in sorted(source.glob('*.md')):
        destination = target / file.name
        if file.name == 'MEMORY.md' and destination.is_file():
            present = set(destination.read_text().splitlines())
            added = [line for line in file.read_text().splitlines()
                     if line.strip() and not line.startswith('#') and line not in present]
            if added:
                text = destination.read_text()
                destination.write_text(text + ('' if text.endswith('\n') else '\n') + '\n'.join(added) + '\n')
        else:
            shutil.copyfile(file, destination)
        count += 1
    print(f'  Claude memory: {count} file(s) → {target}')


def services_running():
    if not shutil.which('tmux'):
        return False
    return any(subprocess.run(['tmux', 'has-session', '-t', f'=irm-{name}'], capture_output=True).returncode == 0
               for name in ('dev', 'storybook'))


def save_config(cfg):
    temp = CONFIG.with_suffix('.tmp')
    temp.write_text(json.dumps(cfg, indent=2) + '\n')
    temp.chmod(0o600)
    temp.replace(CONFIG)


def receive(stream, force=False):
    if not CONFIG.is_file():
        raise ValueError(f'irm is not initialized on this host ({CONFIG}); run irm init in the primary checkout.')
    cfg = json.loads(CONFIG.read_text())
    repo = Path(cfg['repo'])
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        with tarfile.open(fileobj=stream, mode='r|') as tar:
            tar.extractall(root, filter='data')
        spec = json.loads((root / 'spec.json').read_text())
        synced = {}
        if spec['trees']:
            print('Code')
            if subprocess.run(['git', '-C', str(repo), 'fetch', '--quiet', '--prune', 'origin'],
                              capture_output=True).returncode:
                warn('fetch from origin failed; box-only commit detection uses older origin refs')
            elif git(repo, 'symbolic-ref', '--short', 'HEAD', check=False) == 'main' and not git(repo, 'status', '--porcelain'):
                git(repo, 'merge', '--quiet', '--ff-only', 'origin/main', check=False)
            git(repo, 'worktree', 'prune')  # a deleted directory must not count as existing
            for entry in spec['trees']:
                tree = receive_tree(repo, cfg, entry, root / 'trees' / entry['slug'], force)
                if tree:
                    synced[entry['slug']] = tree
            git(repo, 'worktree', 'prune')
        selected = synced.get(spec.get('select'))
        if selected and str(selected) != cfg.get('worktree'):
            if services_running():
                print(f'  services are running here; select it with: irm ws {selected}')
            else:
                cfg['worktree'] = str(selected)
                save_config(cfg)
                print(f'  selected {selected}')
        if (root / 'memory').is_dir():
            merge_memory(root / 'memory', memory_dir(repo))


def info():
    cfg = json.loads(CONFIG.read_text()) if CONFIG.is_file() else None
    if not cfg:
        raise ValueError(f'irm is not initialized on this host ({CONFIG}); run irm init in the primary checkout.')
    print(json.dumps({'repo': cfg['repo'], 'worktree_root': cfg.get('worktree_root')}))


if __name__ == '__main__':
    try:
        if sys.argv[1:2] == ['info']:
            info()
        elif sys.argv[1:2] == ['receive']:
            receive(sys.stdin.buffer, force='--force' in sys.argv[2:])
        else:
            sys.exit('usage: remote.py info | receive [--force]')
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f'irm remote: {error}', file=sys.stderr)
        sys.exit(1)
