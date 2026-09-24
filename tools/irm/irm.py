#!/usr/bin/env python3
"""IRM Ministries worktree and development-service manager (macOS/Linux + tmux)."""
import argparse
from datetime import datetime
import fcntl
import json
import os
import platform
from pathlib import Path
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import re
import time
import tomllib
import network
import git_sync
import remote
import urllib.request
import urllib.error
from urllib.parse import urlsplit, urlunsplit

CONFIG = Path.home() / '.config/irm/config.json'
STATE = Path.home() / '.local/state/irm'
SERVICES = {'dev': 3000, 'storybook': 6006}


def call(args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def output(args):
    return call(args, capture_output=True).stdout.strip()


def config():
    if not CONFIG.exists():
        raise ValueError(f'Missing configuration: {CONFIG}')
    return json.loads(CONFIG.read_text())


def save(data):
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    temp = CONFIG.with_suffix('.tmp')
    temp.write_text(json.dumps(data, indent=2) + '\n')
    temp.chmod(0o600)
    temp.replace(CONFIG)


def tree_metadata():
    raw = output(['git', '-C', config()['repo'], 'worktree', 'list', '--porcelain', '-z'])
    records = []
    for block in raw.split('\0\0'):
        fields = {}
        for line in block.split('\0'):
            if line:
                key, _, value = line.partition(' ')
                fields[key] = value
        if 'worktree' in fields:
            records.append(fields)
    return records


def trees():
    return [(r['worktree'], r.get('branch', 'detached').removeprefix('refs/heads/'))
            for r in tree_metadata()]


def resolve(name):
    matches = [p for p, b in trees() if name in (p, b, Path(p).name) or
               (Path(name).is_absolute() and Path(name).resolve() == Path(p).resolve())]
    if len(matches) != 1:
        raise ValueError(f'Expected one registered worktree for {name!r}; found {len(matches)}. Use irm wt.')
    return Path(matches[0])


def active():
    return resolve(config()['worktree'])


def worktree_details(path, branch):
    if not Path(path).is_dir():
        return {'path': path, 'branch': branch, 'active': False, 'changes': [],
                'upstream': None, 'ahead': None, 'behind': None, 'missing': True}
    changes = call(['git', '-C', path, 'status', '--porcelain=v1', '-z', '--untracked-files=normal'],
                   capture_output=True).stdout.split('\0')
    files = []
    index = 0
    while index < len(changes):
        entry = changes[index]
        index += 1
        if not entry:
            continue
        item = {'status': entry[:2], 'path': entry[3:]}
        if 'R' in entry[:2] or 'C' in entry[:2]:
            item['original_path'] = changes[index]
            index += 1
        files.append(item)
    upstream = subprocess.run(['git', '-C', path, 'rev-parse', '--abbrev-ref', '@{upstream}'],
                              capture_output=True, text=True)
    tracking = upstream.stdout.strip() if upstream.returncode == 0 else None
    ahead = behind = None
    if tracking:
        ahead, behind = map(int, output(['git', '-C', path, 'rev-list', '--left-right',
                                        '--count', 'HEAD...@{upstream}']).split())
    return {'path': path, 'branch': branch, 'active': path == str(active()),
            'changes': files, 'upstream': tracking, 'ahead': ahead, 'behind': behind}


def cleanup_report(base):
    """Only commit ancestry proves integration; a closed PR is insufficient."""
    repo = config()['repo']
    target = output(['git', '-C', repo, 'rev-parse', '--verify', base + '^{commit}'])
    target_ref = output(['git', '-C', repo, 'rev-parse', '--symbolic-full-name', '--verify', base])
    target_branches = {target_ref.removeprefix('refs/heads/')} if target_ref.startswith('refs/heads/') else set()
    if target_ref.startswith('refs/remotes/'):
        for remote in output(['git', '-C', repo, 'remote']).splitlines():
            prefix = f'refs/remotes/{remote}/'
            if target_ref.startswith(prefix):
                target_branches.add(target_ref.removeprefix(prefix))
    registered = trees()
    protected = [(Path(registered[0][0]).resolve(), 'primary worktree'),
                 (active().resolve(), 'active worktree')]
    for service in SERVICES:
        if running(service):
            protected.append((Path(session_tree(service)).resolve(), f'running {service}'))
    fallback = Path.home() / '.local/bin/irm'
    locations = [(Path.cwd().resolve(), 'current directory'),
                 (Path(__file__).resolve(), 'executing CLI'),
                 (fallback.resolve(), 'installed CLI')]
    metadata = tree_metadata()
    report = []
    for path, branch in registered:
        root = Path(path).resolve()
        reasons = []
        reasons.extend(reason for location, reason in protected if root == location)
        for location, reason in locations:
            if location == root or root in location.parents:
                reasons.append(reason)
        if branch == 'detached':
            reasons.append('detached HEAD')
        if branch in target_branches:
            reasons.append('selected merge target')
        if branch in ('main', 'master', 'develop'):
            reasons.append('integration branch')
        record = next(r for r in metadata if r['worktree'] == path)
        if 'locked' in record:
            reasons.append('locked worktree')
        merged = False
        head = None
        if not root.is_dir():
            reasons.append('missing directory')
        else:
            head = output(['git', '-C', path, 'rev-parse', 'HEAD'])
            check = subprocess.run(['git', '-C', repo, 'merge-base', '--is-ancestor', head, target],
                                   capture_output=True, text=True)
            if check.returncode not in (0, 1):
                raise ValueError(check.stderr.strip() or 'Cannot determine merge status')
            merged = check.returncode == 0
            if output(['git', '-C', path, 'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none']):
                reasons.append('uncommitted changes')
        if root.is_dir():
            disposable = {'node_modules', '.next', 'coverage', 'playwright-report', 'test-results',
                          'storybook-static', 'next-env.d.ts', 'tsconfig.tsbuildinfo', '__pycache__'}
            ignored = output(['git', '-C', path, 'ls-files', '--others', '--ignored',
                              '--exclude-standard', '--directory', '-z']).split('\0')
            personal = [p for p in ignored if p and p.split('/')[0] not in disposable
                        and '__pycache__' not in Path(p).parts]
            if personal:
                reasons.append('local ignored files: ' + ', '.join(personal[:5]))
        if not merged:
            reasons.append(f'not merged into {base}')
        report.append({'path': path, 'branch': branch, 'head': head, 'merged': merged,
                       'eligible': not reasons, 'reasons': reasons})
    return report


def cleanup(args):
    repo = config()['repo']
    if not args.no_fetch:
        call(['git', '-C', repo, 'fetch', 'origin'])
    report = cleanup_report(args.base)
    if args.json:
        print(json.dumps(report, indent=2))
        return
    print(f'Merge target: {args.base}' + (' (last fetched refs)' if args.no_fetch else ''))
    for tree in report:
        state = 'ready to clean' if tree['eligible'] else '; '.join(tree['reasons'])
        print(f"{tree['branch']}: {state}\n  {tree['path']}")
    candidates = [tree for tree in report if tree['eligible']]
    if not candidates:
        print('No worktrees eligible for cleanup.')
        return
    if args.dry_run or not sys.stdin.isatty():
        print('Preview only. Run irm cleanup in a terminal to choose worktrees to remove.')
        return
    for tree in candidates:
        answer = input(f"Remove {tree['path']} including disposable build artifacts? [y/N] ")
        if answer.strip().lower() not in ('y', 'yes'):
            continue
        # Recheck after the prompt: branches, edits and service ownership can change.
        current = next((item for item in cleanup_report(args.base) if item['path'] == tree['path']), None)
        if not current or not current['eligible'] or current['head'] != tree['head'] or current['branch'] != tree['branch']:
            print(f"Skipped {tree['path']}: worktree state changed; run cleanup again.")
            continue
        call(['git', '-C', repo, 'worktree', 'remove', tree['path']])
        print(f"Removed {tree['path']}; retained branch {tree['branch']}.")


def initialize(worktree_root=None):
    if CONFIG.exists():
        raise ValueError(f'Configuration already exists: {CONFIG}; use irm ws to select a worktree.')
    tree = Path(output(['git', 'rev-parse', '--show-toplevel'])).resolve()
    raw = output(['git', '-C', str(tree), 'worktree', 'list', '--porcelain', '-z'])
    repo = raw.split('\0', 1)[0].removeprefix('worktree ')
    data = {'repo': repo, 'worktree': str(tree), 'network': 'auto', 'theme': 'auto'}
    if worktree_root:
        data['worktree_root'] = str(Path(worktree_root).expanduser().resolve())
    for candidate in (tree / '.env', Path(repo) / '.env'):
        if candidate.is_file():
            data['env_source'] = str(candidate.resolve())
            break
    save(data)
    print(f'Initialized IRM at {tree}; config: {CONFIG}')


def new_tree(branch, slug):
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
        raise ValueError('Use a lowercase task slug separated by hyphens.')
    repo = config()['repo']
    output(['git', '-C', repo, 'check-ref-format', '--branch', branch])
    call(['git', '-C', repo, 'fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main'])
    head = output(['git', '-C', repo, 'rev-parse', 'origin/main'])
    destination = remote.worktree_path(config(), slug)
    destination.parent.mkdir(parents=True, exist_ok=True)
    call(['git', '-C', repo, 'worktree', 'add', '--no-track', '-b', branch, str(destination), head])
    if (output(['git', '-C', str(destination), 'rev-parse', 'HEAD']) != head or
        output(['git', '-C', str(destination), 'symbolic-ref', '--short', 'HEAD']) != branch):
        raise ValueError(f'Unexpected worktree state; inspect {destination}')
    print(f'Created {branch} at {destination} from {head}. Select with irm ws {branch}.')


def worktree_context():
    selected = str(active())
    registered = trees()
    branch = next(branch for path, branch in registered if path == selected)
    details = worktree_details(selected, branch)
    details['recent_commits'] = output(['git', '-C', selected, 'log', '-5', '--format=%h %s']).splitlines()
    services = {}
    for name in SERVICES:
        if running(name):
            services[name] = session_tree(name)
    return {'repo': config()['repo'], 'cwd': str(Path.cwd()),
            'active_worktree': details, 'services': services,
            'worktrees': [{'path': path, 'branch': branch} for path, branch in registered]}


def print_context(as_json=False):
    context = worktree_context()
    if as_json:
        print(json.dumps(context, indent=2))
        return
    tree = context['active_worktree']
    print(f"Active: {tree['path']}\nBranch: {tree['branch']}\nShell directory: {context['cwd']}")
    if tree['upstream']:
        print(f"Tracking: {tree['upstream']} ({tree['ahead']} ahead, {tree['behind']} behind; last fetched refs)")
    print('Pending changes:')
    for item in tree['changes']:
        print(f"  {item['status']} {item['path']}")
    if not tree['changes']:
        print('  Clean')
    print('Recent commits:')
    for commit in tree['recent_commits']:
        print('  ' + commit)
    for service, path in context['services'].items():
        print(f'{service} runs from: {path}')
    print('Compare the request with this work before editing. Reuse related work; ask if unsure.')


def session(service):
    return 'irm-' + service


def running(service):
    if not shutil.which('tmux'):
        return False
    return subprocess.run(['tmux', 'has-session', '-t', '=' + session(service)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def session_tree(service):
    return output(['tmux', 'show-options', '-v', '-t', session(service), '@irm-worktree'])


def listening_host(port):
    # IPv6 wildcard listeners need not accept IPv4 (IPV6_V6ONLY). Use both
    # loopbacks for conflict checks, readiness, shutdown, and health probes.
    for family, host in ((socket.AF_INET, '127.0.0.1'), (socket.AF_INET6, '::1')):
        try:
            with socket.socket(family, socket.SOCK_STREAM) as sock:
                sock.settimeout(0.3)
                if sock.connect_ex((host, port)) == 0:
                    return host
        except OSError:
            # IPv6 can be disabled or unavailable on an otherwise healthy host.
            continue
    return None


def occupied(port):
    return listening_host(port) is not None


def address():
    # irm remote runs the host's dashboard with IRM_NETWORK=local: the browser
    # reaches it through SSH forwards, never the host's network address.
    return network.address(os.environ.get('IRM_NETWORK') or config().get('network', 'auto'))


def read_environment():
    try:
        helper = active() / 'tools/irm/environment.mjs'
        if not helper.is_file():
            helper = Path(__file__).with_name('environment.mjs')
        return json.loads(call(['node', str(helper)],
                               cwd=active(), capture_output=True, timeout=5).stdout)
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        raise ValueError('Could not load development environment. Run irm setup and check env file syntax.') from error


def browser_url(url):
    parsed = urlsplit(url)
    if parsed.hostname in ('localhost', '127.0.0.1', '::1'):
        host = address()
        if host != 'localhost':
            port = f':{parsed.port}' if parsed.port else ''
            return urlunsplit((parsed.scheme, network.url_host(host) + port, parsed.path, parsed.query, parsed.fragment))
    return url


def safe_endpoint(url):
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            return 'missing or invalid'
        host = parsed.hostname
        if ':' in host:
            host = '[' + host + ']'
        return f'{parsed.scheme}://{host}' + (f':{parsed.port}' if parsed.port else '')
    except ValueError:
        return 'missing or invalid'


def supabase_settings():
    values = read_environment()
    return browser_url(values['url']), values['key']


def environment_status():
    tree = active()
    data = {'state': 'unavailable', 'files': [], 'variables': [],
            'configured_source': config().get('env_source'), 'endpoint': 'unavailable'}
    try:
        values = read_environment()
        for name in values['files']:
            path = tree / name
            data['files'].append({'name': name, 'path': str(path),
                                  'source': str(path.resolve()),
                                  'state': 'linked' if path.is_symlink() and path.is_file() else
                                  'file' if path.is_file() else 'broken link' if path.is_symlink() else 'missing'})
        data['variables'] = values['variables']
        data['endpoint'] = safe_endpoint(browser_url(values['url']))
        required = {'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'}
        present = {v['name'] for v in values['variables'] if v['state'] == 'set'}
        has_database = bool({'DATABASE_URL', 'POSTGRES_URL'} & present)
        data['state'] = 'ready' if has_database and required <= present and data['endpoint'] != 'missing or invalid' else 'incomplete'
    except ValueError as error:
        data['error'] = str(error)
    return data


def environment_lines(data):
    lines = [f"Environment: {data['state']} (next dev start; restart dev after changes)",
             f"Setup source: {data['configured_source'] or 'not configured'}",
             f"Supabase endpoint: {data['endpoint']}"]
    for file in data['files']:
        source = os.path.relpath(file['source'], Path(file['path']).parent)
        lines.append(f"  {file['name']}: {file['state']} → {source}")
    for var in data['variables']:
        lines.append(f"  {var['name']}: {var['state']} ({var['source'] or 'not configured'})")
    if data.get('error'):
        lines.append(data['error'])
    return lines


def supabase_status():
    try:
        project = tomllib.loads((active() / 'supabase/config.toml').read_text())['project_id']
        result = call(['docker', 'ps', '-a', '--format', '{{json .}}'], capture_output=True, timeout=5)
        containers = []
        for line in result.stdout.splitlines():
            row = json.loads(line)
            name = row['Names']
            if name.startswith('supabase_') and name.endswith('_' + project):
                containers.append({'name': name[len('supabase_'):-len('_' + project)],
                                   'state': row['State'], 'status': row['Status']})
        core = {c['name']: c for c in containers if c['name'] in ('db', 'auth', 'kong')}
        ready = len(core) == 3 and all(c['state'] == 'running' and
                 'starting' not in c['status'] and 'unhealthy' not in c['status'] for c in core.values())
        state = 'ready' if ready else 'stopped' if not any(c['state'] == 'running' for c in containers) else 'not ready'
        return {'project': project, 'state': state, 'containers': containers}
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        return {'project': None, 'state': 'unavailable', 'containers': [],
                'error': 'Check Docker and the selected worktree’s supabase/config.toml.'}


def supabase_lines(data):
    return [f"Supabase: {data['state']} · {data['project'] or 'unknown project'}"] + [
        f"  {c['name']}: {c['status']}" for c in data['containers']
    ] + ([data['error']] if data.get('error') else [])


def manage_supabase(action):
    if action == 'stop' and running('dev'):
        raise ValueError('Stop dev first with irm stop dev before stopping its shared local database.')
    project = tomllib.loads((active() / 'supabase/config.toml').read_text())['project_id']
    args = ['supabase', action]
    if action == 'stop':
        args += ['--project-id', project]
    print(f'{action.capitalize()} local Supabase ({project})…', flush=True)
    # Supabase startup prints credentials. Capture output and never forward it.
    try:
        call(args, cwd=active(), capture_output=True)
    except (OSError, subprocess.SubprocessError) as error:
        raise ValueError('Supabase command failed. Check irm supabase status, Docker, and local port availability.') from error
    print('\n'.join(supabase_lines(supabase_status())))


def require_supabase():
    data = supabase_status()
    if data['state'] != 'ready':
        raise ValueError(f"Local Supabase is {data['state']}; run irm supabase start, then retry dev.")


def auth_container():
    path = active() / 'supabase/config.toml'
    project = tomllib.loads(path.read_text())['project_id']
    return 'supabase_auth_' + project


def bun_command(tree):
    """Honor the checkout's pinned runtime without changing the user's global Bun."""
    version_file = tree / '.bun-version'
    if not version_file.is_file():
        return ['bun']
    version = version_file.read_text().strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid .bun-version; expected a release such as 1.4.2.')
    installed = subprocess.run(['bun', '--version'], capture_output=True, text=True)
    if installed.returncode == 0 and installed.stdout.strip() == version:
        return ['bun']
    if not shutil.which('bunx'):
        raise ValueError(f'Bun {version} is required; install it or provide bunx on PATH.')
    return ['bunx', f'bun@{version}']


def setup(env_source=None, install=True):
    tree = active()
    cfg = config()
    source_value = env_source or cfg.get('env_source')
    if not source_value:
        raise ValueError('Choose an environment source: irm setup --env /path/to/.env')
    source = Path(source_value).expanduser().resolve()
    if not source.is_file():
        raise ValueError(f'Environment source missing: {source}. Use irm setup --env /path/to/.env.local')
    dest = tree / '.env'
    if not os.path.lexists(dest):
        ignored = subprocess.run(['git', '-C', str(tree), 'check-ignore', '-q', '.env'])
        tracked = output(['git', '-C', str(tree), 'ls-files', '--', '.env'])
        if ignored.returncode != 0 or tracked:
            raise ValueError('Refusing to link .env because Git does not safely ignore it.')
        dest.symlink_to(source)
        print(f'Linked {dest} -> {source}')
    elif not dest.is_file():
        raise ValueError(f'Existing environment path is invalid: {dest}; left intact.')
    elif env_source and dest.resolve() != source:
        raise ValueError(f'{dest} already exists; left intact. Remove it explicitly to change sources.')
    if env_source:
        cfg['env_source'] = str(source)
        save(cfg)
    if install or not (tree / 'node_modules/next/package.json').is_file():
        call([*bun_command(tree), 'install', '--frozen-lockfile'], cwd=tree)
    print(f'Ready: {tree}')


def migrate_local(tree):
    """Explicit Drizzle migration, restricted to this project's local database."""
    settings = tomllib.loads((tree / 'supabase/config.toml').read_text())
    values = read_environment()
    database = values.get('direct_url') or values.get('database_url', '')
    try:
        parsed = urlsplit(database)
        local = (parsed.scheme in ('postgres', 'postgresql') and
                 parsed.hostname in ('localhost', '127.0.0.1', '::1') and
                 parsed.port == settings['db']['port'] and parsed.path == '/postgres' and
                 not parsed.query and not parsed.fragment)
    except ValueError:
        local = False
    if not local:
        raise ValueError('irm migrate requires a local Postgres URL on the selected Supabase db.port; hosted databases are never migrated.')
    require_supabase()
    print(f'Applying Drizzle migrations from {tree} to local port {parsed.port}…', flush=True)
    # Pin every CLI fallback to the validated URL. Do not print connection strings.
    env = {**os.environ, 'DIRECT_URL': database, 'DATABASE_URL': database,
           'POSTGRES_URL_NON_POOLING': database}
    try:
        call([*bun_command(tree), 'run', 'db:migrate'], cwd=tree, env=env, capture_output=True)
    except subprocess.SubprocessError as error:
        raise ValueError('Local Drizzle migration failed. Inspect the selected branch’s db/migrations and local schema; no reset or history repair was attempted.') from error
    print('Local migrations applied.')


def validate_service_scripts(tree, services):
    scripts = json.loads((tree / 'package.json').read_text()).get('scripts', {})
    for service in services:
        if not isinstance(scripts.get(service), str) or not scripts[service].strip():
            raise ValueError(f'No usable {service!r} script in {tree}/package.json. '
                             'Select a worktree that defines it or request an available service explicitly.')


def start(service):
    tree = active()
    if not shutil.which('tmux'):
        raise ValueError('tmux is required to start managed services.')
    if running(service):
        if session_tree(service) != str(tree):
            raise ValueError(f'{service} is running from another worktree. Stop it before switching.')
        print(f'{service} already running')
        return
    port = SERVICES[service]
    if occupied(port):
        if remote.session_open():
            raise ValueError(f'Port {port} is forwarded to the remote by irm remote. Close it with irm remote kill.')
        raise ValueError(f'Port {port} is occupied by a process outside irm; left intact.')
    validate_service_scripts(tree, [service])
    if service == 'dev':
        setup(install=False)
        if urlsplit(read_environment()['url']).hostname in ('localhost', '127.0.0.1', '::1'):
            require_supabase()
        # Shared database changes are explicit: irm migrate.
    elif not (tree / 'node_modules/next/package.json').is_file():
        call([*bun_command(tree), 'install', '--frozen-lockfile'], cwd=tree)
    host = address()
    bind = '127.0.0.1' if host == 'localhost' else '::' if ':' in host else '0.0.0.0'
    args = [*bun_command(tree), 'run', service]
    args += ['--hostname', bind, '--port', str(port)] if service == 'dev' else ['--host', bind, '--port', str(port), '--no-open']
    log = STATE / f'{service}.log'
    with log.open('a') as stream:
        stream.write(f'\n--- {datetime.now().isoformat(timespec="seconds")} Starting {service} in {tree} ---\n')
    environment = ['-e', 'PATH=' + os.environ['PATH'], '-e', 'IRM_DEV_HOST=' + host,
                   '-e', 'STORYBOOK_ALLOWED_HOSTS=localhost,127.0.0.1,' + host,
                   '-e', f'NEXT_PUBLIC_APP_URL=http://{network.url_host(host)}:{SERVICES["dev"]}']
    if service == 'dev':
        url, _ = supabase_settings()
        if url:
            environment += ['-e', 'NEXT_PUBLIC_SUPABASE_URL=' + url]
            print(f'Supabase endpoint: {safe_endpoint(url)}')
    command = 'exec ' + shlex.join(args) + ' >> ' + shlex.quote(str(log)) + ' 2>&1'
    call(['tmux', 'new-session', '-d', '-s', session(service), '-c', str(tree),
          *environment, command])
    call(['tmux', 'set-option', '-t', session(service), '@irm-worktree', str(tree)])
    for _ in range(60):
        if not running(service):
            raise ValueError(f'{service} exited. Run irm logs {service} --lines 60')
        if occupied(port):
            print(f'Started {service}; logs: {log}')
            return
        time.sleep(0.25)
    raise ValueError(f'{service} is still starting. Run irm status or irm logs {service}.')


def process_snapshot():
    if platform.system() == 'Darwin':
        processes = {}
        for line in output(['ps', '-axo', 'pid=,ppid=,lstart=']).splitlines():
            fields = line.split(maxsplit=2)
            if len(fields) == 3:
                processes[int(fields[0])] = (int(fields[1]), fields[2].strip())
        return processes
    processes = {}
    for path in Path('/proc').glob('[0-9]*/stat'):
        try:
            fields = path.read_text().rsplit(')', 1)[1].split()
            processes[int(path.parent.name)] = (int(fields[1]), fields[19])
        except (OSError, ValueError, IndexError):
            continue
    return processes


def process_matches(pid, started):
    try:
        if platform.system() == 'Darwin':
            return output(['ps', '-p', str(pid), '-o', 'lstart=']) == started
        return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19] == started
    except (OSError, subprocess.SubprocessError, IndexError):
        return False


def stop(service):
    if running(service):
        if not session_tree(service):
            raise ValueError(f'Session {session(service)} is not marked as managed by irm; left intact.')
        roots = {int(p) for p in output(['tmux', 'list-panes', '-t', session(service), '-F', '#{pane_pid}']).splitlines()}
        processes = process_snapshot()
        descendants = set(roots)
        while True:
            found = {pid for pid, (parent, _) in processes.items() if parent in descendants}
            if found <= descendants:
                break
            descendants.update(found)
        # bun/Next children may survive tmux's SIGHUP. Terminate the captured
        # process tree, checking start times to avoid reused PIDs on both hosts.
        for pid in descendants - roots:
            try:
                if process_matches(pid, processes[pid][1]):
                    os.kill(pid, signal.SIGTERM)
            except (OSError, KeyError):
                pass
        if running(service):
            call(['tmux', 'kill-session', '-t', '=' + session(service)])
        for _ in range(40):
            if not occupied(SERVICES[service]):
                break
            time.sleep(0.1)
        if occupied(SERVICES[service]):
            raise ValueError(f'{service} session stopped, but port {SERVICES[service]} is still occupied; unrelated processes left intact.')
        print(f'Stopped {service}')
    else:
        print(f'{service} is not managed/running; other processes left intact')


def status_lines():
    host = network.url_host(address())
    lines = [f'Worktree: {active()}', f'Network: {config().get("network", "auto")} ({host})', '']
    for name, port in SERVICES.items():
        live = running(name)
        state = 'running' if live else ('port occupied (unmanaged)' if occupied(port) else 'stopped')
        lines.append(f'{name:10} {state:26} http://{host}:{port}')
        if live:
            lines.append(f'           from {session_tree(name)}')
    lines += supabase_lines(supabase_status())
    env = environment_status()
    lines += [f"Environment: {env['state']} · irm env shows sources", f"Supabase endpoint: {env['endpoint']}"]
    return lines


def doctor():
    print('\n'.join(status_lines()))
    # Local health checks must stay local even when HTTP proxy variables are set.
    local_http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for name, port in SERVICES.items():
        try:
            host = listening_host(port)
            if host is None:
                print(f'{name}: unavailable (no loopback listener)')
                continue
            with local_http.open(f'http://{network.url_host(host)}:{port}', timeout=20) as response:
                print(f'{name}: HTTP {response.status}')
        except urllib.error.HTTPError as error:
            print(f'{name}: HTTP {error.code} — inspect irm logs {name}')
        except (OSError, urllib.error.URLError) as error:
            print(f'{name}: unavailable ({error})')
    url, key = supabase_settings()
    print(f'Supabase endpoint for browsers: {safe_endpoint(url)}')
    if not url or not key:
        print('Supabase URL or anonymous key missing; sign-in cannot work.')
        return
    request = urllib.request.Request(url.rstrip('/') + '/auth/v1/health', headers={'apikey': key})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            print(f'Supabase Auth: HTTP {response.status}')
    except (OSError, urllib.error.URLError) as error:
        print('Supabase Auth unavailable; inspect irm logs auth and irm env.')


def select_tree(name=None):
    if name and resolve(name) == active():
        print(f'Already active: {active()}')
        return
    if any(running(s) for s in SERVICES):
        raise ValueError('Stop managed services first: irm stop all')
    if not name:
        options = trees()
        for i, (p, branch) in enumerate(options, 1):
            print(f'{i}. {branch}  {p}')
        index = int(input('Worktree number: ')) - 1
        if not 0 <= index < len(options):
            raise ValueError('Invalid worktree number')
        name = options[index][0]
    path = resolve(name)
    cfg = config()
    cfg['worktree'] = str(path)
    save(cfg)
    print(f'Active worktree: {path}\nRun irm setup or irm run all.')


def dashboard_data():
    host = network.url_host(address())
    selected = str(active())
    services = []
    for name, port in SERVICES.items():
        live = running(name)
        services.append({'name': name, 'state': 'running' if live else
                         ('occupied' if occupied(port) else 'stopped'),
                         'url': f'http://{host}:{port}',
                         'worktree': session_tree(name) if live else None})
    return {'worktree': selected,
            'branch': next(branch for path, branch in trees() if path == selected),
            'services': services, 'theme': config().get('theme', 'auto'),
            'supabase': supabase_status(),
            'environment': {key: value for key, value in environment_status().items()
                            if key in ('state', 'endpoint', 'variables')}}


def dashboard():
    ui = Path(__file__).with_name('dashboard.ts')
    if not shutil.which('bun') or not (ui.parents[2] / 'node_modules/@opentui/core').exists():
        raise ValueError(f'Dashboard requires Bun >= 1.3 and dependencies. Run bun install in {ui.parents[2]}. '
                         'Text commands such as irm status still work.')
    command = [*bun_command(ui.parents[2]), str(ui)]
    os.execvp(command[0], command)


def remote_command(args):
    if args.action == 'kill':
        remote.kill()
    elif args.action == 'host':
        with (STATE / 'lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            cfg = config()
            if args.names:
                cfg['remote_hosts'] = args.names
                save(cfg)
        print('Remote hosts: ' + (', '.join(remote.hosts(cfg)) or 'none (irm remote host user@host [fallback])'))
    elif args.action == 'sync':
        registered = trees()
        if args.all:
            targets = registered[1:]
        else:
            paths = [resolve(name) for name in args.names] or [active()]
            targets = [(p, b) for p, b in registered if Path(p) in paths]
        remote.sync(config(), registered, targets, active(), force=args.force,
                    memory=not args.no_memory, code=not args.memory_only)
    elif args.action == '_loop':
        remote.dashboard_loop(config(), active(), occupied)
    else:
        loop = [sys.executable, str(Path(__file__).resolve()), 'remote', '_loop']
        remote.open_dashboard(config(), active(), occupied, loop)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command')
    p = sub.add_parser('init', help='Initialize configuration from this checkout')
    p.add_argument('--worktree-root', help='Create worktrees under this directory instead of beside the checkout')
    sub.add_parser('migrate', help='Apply Drizzle migrations to the local project only')
    p = sub.add_parser('new', help='Create a branch and sibling worktree from fresh origin/main')
    p.add_argument('branch')
    p.add_argument('slug')
    for command in ('run', 'stop', 'restart'):
        p = sub.add_parser(command)
        p.add_argument('service', choices=[*SERVICES, 'all'], default='all', nargs='?')
    p = sub.add_parser('logs')
    p.add_argument('service', choices=[*SERVICES, 'auth'], default='dev', nargs='?')
    p.add_argument('--lines', type=int, help='Print this many lines and exit (default: follow)')
    p = sub.add_parser('setup')
    p.add_argument('--env', help='Environment source path; never overwrites existing files')
    p = sub.add_parser('network', help='Choose auto/local/LAN/Tailscale URLs; restart dev after changing')
    p.add_argument('mode', choices=network.MODES, nargs='?')
    p = sub.add_parser('wt', help='List worktrees, active selection, and pending-change counts')
    p.add_argument('--json', action='store_true', help='Print machine-readable worktree details')
    p = sub.add_parser('cleanup', help='Check merged worktrees and offer safe removal')
    p.add_argument('--base', default='origin/main', help='Integration ref (default: origin/main)')
    p.add_argument('--no-fetch', action='store_true', help='Use last fetched refs')
    p.add_argument('--dry-run', action='store_true', help='Report without prompting or removing')
    p.add_argument('--json', action='store_true', help='Report JSON without removing')
    p = sub.add_parser('context', help='Inspect the active branch, changes, commits, and running services')
    p.add_argument('--json', action='store_true', help='Print machine-readable session context')
    p = sub.add_parser('ws', help='Select active worktree by branch, directory name, or path')
    p.add_argument('worktree', nargs='?')
    p = sub.add_parser('env', help='Show development env sources and presence, never credential values')
    p.add_argument('--json', action='store_true')
    p = sub.add_parser('supabase', help='Manage the selected worktree’s local Supabase stack')
    p.add_argument('action', choices=['status', 'start', 'stop'], default='status', nargs='?')
    p.add_argument('--json', action='store_true', help='JSON status output')
    sub.add_parser('pull', help='Fast-forward the selected worktree branch from its configured upstream')
    p = sub.add_parser('updates', help='Fetch upstream metadata and check for available changes without changing files')
    p.add_argument('--json', action='store_true')
    p.add_argument('--cached', action='store_true', help='Use existing remote-tracking refs without fetching')
    sub.add_parser('ui-state', help='Read-only dashboard snapshot (JSON)')
    p = sub.add_parser('theme', help='Dashboard palette (auto follows terminal appearance)')
    p.add_argument('mode', choices=['auto', 'light', 'dark'], nargs='?')
    p = sub.add_parser('remote', help='Remote host over SSH: dashboard with forwarded ports, worktree sync')
    p.add_argument('action', choices=['open', 'kill', 'sync', 'host', '_loop'], default='open', nargs='?')
    p.add_argument('names', nargs='*', help='sync: worktrees (default: the selected one); host: SSH hosts in order')
    p.add_argument('--all', action='store_true', help='sync: every worktree except the primary checkout')
    p.add_argument('--force', action='store_true', help='sync: overwrite edits and commits made on the remote')
    p.add_argument('--no-memory', action='store_true', help='sync: skip Claude project memory')
    p.add_argument('--memory-only', action='store_true', help='sync: only Claude project memory')
    for cmd in ('cd', 'status', 'doctor'):
        sub.add_parser(cmd)
    args = parser.parse_args(argv)
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    if args.command in ('init', 'new', 'migrate', 'run', 'stop', 'restart', 'setup', 'ws', 'network', 'theme', 'cleanup', 'pull', 'updates') or (args.command == 'supabase' and args.action != 'status'):
        with (STATE / 'lock').open('w') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise ValueError("Another irm command is running. Retry when it finishes.") from error
            if args.command == 'init':
                initialize(args.worktree_root)
            elif args.command == 'new':
                new_tree(args.branch, args.slug)
            elif args.command == 'migrate':
                migrate_local(active())
            elif args.command == 'cleanup':
                cleanup(args)
            elif args.command == 'pull':
                git_sync.pull(active())
            elif args.command == 'updates':
                result = git_sync.check_updates(active(), fetch=not args.cached)
                print(json.dumps(result) if args.json else result['message'])
            elif args.command == 'supabase':
                if args.json:
                    raise ValueError('--json is only supported for supabase status.')
                else:
                    manage_supabase(args.action)
            elif args.command == 'theme':
                cfg = config()
                if args.mode:
                    cfg['theme'] = args.mode
                    save(cfg)
                print(cfg.get('theme', 'auto'))
            elif args.command == 'network':
                cfg = config()
                if args.mode:
                    network.address(args.mode)
                    cfg['network'] = args.mode
                    save(cfg)
                print(f'Network: {cfg.get("network", "auto")} ({address()})')
                if args.mode:
                    print('Run irm restart dev, then refresh your browser.')
            elif args.command == 'setup':
                setup(args.env)
            elif args.command == 'ws':
                select_tree(args.worktree)
            else:
                services = list(SERVICES) if args.service == 'all' else [args.service]
                # Validate the whole request before migrations, starts, or restart stops.
                if args.command in ('run', 'restart'):
                    validate_service_scripts(active(), services)
                if args.command in ('stop', 'restart'):
                    for service in services:
                        stop(service)
                if args.command in ('run', 'restart'):
                    for service in services:
                        start(service)
                    print('\n'.join(status_lines()))
    elif args.command == 'remote':
        remote_command(args)
    elif args.command == 'supabase':
        data = supabase_status()
        print(json.dumps(data) if args.json else '\n'.join(supabase_lines(data)))
    elif args.command == 'env':
        data = environment_status()
        print(json.dumps(data) if args.json else '\n'.join(environment_lines(data)))
    elif args.command == 'ui-state':
        print(json.dumps(dashboard_data()))
    elif args.command == 'logs':
        count = args.lines if args.lines is not None else 60
        if count < 1:
            raise ValueError('--lines must be positive')
        if args.service == 'auth':
            call(['docker', 'logs', '--tail', str(count), *([] if args.lines is not None else ['-f']), auth_container()])
        else:
            log = STATE / f'{args.service}.log'
            log.touch(mode=0o600, exist_ok=True)
            call(['tail', '-n', str(count), *([] if args.lines is not None else ['-f']), str(log)])
    elif args.command == 'wt':
        details = [worktree_details(path, branch) for path, branch in trees()]
        if args.json:
            print(json.dumps(details, indent=2))
        else:
            for tree in details:
                state = 'missing' if tree.get('missing') else f"{len(tree['changes'])} changed" if tree['changes'] else 'clean'
                print(f"{'*' if tree['active'] else ' '} {tree['branch']:32} {state:12} {tree['path']}")
            print('Check merged worktrees with irm cleanup --dry-run; run irm cleanup to choose removals.')
    elif args.command == 'context':
        print_context(args.json)
    elif args.command == 'cd':
        print(active())
    elif args.command == 'status':
        print('\n'.join(status_lines()))
    elif args.command == 'doctor':
        doctor()
    elif sys.stdin.isatty() and sys.stdout.isatty() and os.environ.get('TERM', 'dumb') != 'dumb':
        dashboard()
    else:
        print('\n'.join(status_lines()))
        if args.command is None:
            print('Remote: ' + git_sync.check_updates(active())['message'])


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except KeyboardInterrupt:
        pass
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f'irm: {error}', file=sys.stderr)
        sys.exit(1)
