"""Upstream checks and fast-forward-only pulls for one selected worktree."""
import os
import subprocess


def git(tree, *args, timeout=30):
    env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'}
    # Preserve custom SSH configuration, but don't hang the dashboard on prompts.
    env.setdefault('GIT_SSH_COMMAND', 'ssh -o BatchMode=yes -o ConnectTimeout=10')
    return subprocess.run(['git', '-C', str(tree), *args], capture_output=True,
                          text=True, timeout=timeout, env=env)


def tracking(tree):
    branch = git(tree, 'symbolic-ref', '--quiet', '--short', 'HEAD')
    if branch.returncode:
        raise ValueError('Detached HEAD: check out a branch before checking or pulling updates.')
    name = branch.stdout.strip()
    result = git(tree, 'for-each-ref', '--format=%(upstream:remotename)%00%(upstream:remoteref)%00%(upstream)', 'refs/heads/' + name)
    fields = result.stdout.strip().split('\0')
    if result.returncode or len(fields) != 3 or not all(fields):
        raise ValueError(f'Branch {name} has no upstream. Set its tracking branch with git branch --set-upstream-to, then retry.')
    return name, *fields


def check_updates(tree, fetch=True):
    result = {'worktree': str(tree), 'state': 'unavailable', 'message': 'Remote status unavailable.'}
    try:
        branch, remote, remote_ref, upstream = tracking(tree)
        result.update(branch=branch, upstream=upstream)
        if fetch and remote != '.':
            fetched = git(tree, 'fetch', '--quiet', '--no-tags', '--no-recurse-submodules', remote, f'+{remote_ref}:{upstream}')
            if fetched.returncode:
                raise ValueError('Remote check failed. Check network access and Git authentication, then retry irm updates.')
        # Selection may have changed through an external Git command during fetch.
        if tracking(tree) != (branch, remote, remote_ref, upstream):
            raise ValueError('Branch or upstream changed during the remote check. Retry irm updates.')
        counts = git(tree, 'rev-list', '--left-right', '--count', f'HEAD...{upstream}')
        if counts.returncode:
            raise ValueError('The upstream branch is unavailable. Check its remote tracking configuration.')
        ahead, behind = map(int, counts.stdout.split())
        if ahead and behind:
            state, message = 'diverged', f'Diverged: {ahead} local / {behind} remote commits'
        elif behind:
            state, message = 'behind', f'{behind} remote commit(s) available · p pulls'
        elif ahead:
            state, message = 'ahead', f'{ahead} local commit(s) ahead; no remote updates'
        else:
            state, message = 'current', 'Up to date with upstream'
        result.update(state=state, message=message, ahead=ahead, behind=behind)
    except subprocess.TimeoutExpired:
        result['message'] = 'Remote check timed out. Retry irm updates when the connection is available.'
    except (OSError, ValueError) as error:
        result['message'] = str(error) if isinstance(error, ValueError) else 'Git is unavailable. Check your installation.'
    return result


def pull(tree):
    branch, _, _, upstream = tracking(tree)
    print(f'Pulling {branch} from {upstream} in {tree}…', flush=True)
    try:
        result = git(tree, 'pull', '--ff-only', '--no-rebase', '--no-autostash', '--no-squash', '--no-recurse-submodules', timeout=120)
    except subprocess.TimeoutExpired as error:
        raise ValueError('Pull timed out. Check git status and network access before retrying.') from error
    if result.returncode:
        error = result.stderr.lower()
        if 'would be overwritten' in error or 'unmerged files' in error or 'not concluded your merge' in error:
            raise ValueError('Pull blocked by local changes or an unfinished merge. Commit or resolve them, then retry; no automatic stash or reset was made.')
        if 'not possible to fast-forward' in error or 'divergent branches' in error:
            raise ValueError('Local and upstream history have diverged. Resolve this with Git; irm only permits fast-forward pulls.')
        raise ValueError('Git pull failed. Check git status, upstream configuration, and network/authentication; no automatic stash, reset, rebase, or merge commit was requested.')
    print(result.stdout.strip() or 'Pull completed.', flush=True)
    print('Run irm setup if dependencies changed, then irm restart dev to reload dependency changes; use irm migrate separately for local schema changes. Reopen the dashboard if irm itself changed.')
