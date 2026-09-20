import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import git_sync
import launch
import irm


class GitSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.remote = self.root / 'remote.git'
        self.writer = self.root / 'writer'
        self.tree = self.root / 'selected tree'
        self.run_git(self.root, 'init', '--bare', '--initial-branch=main', str(self.remote))
        self.run_git(self.root, 'clone', str(self.remote), str(self.writer))
        self.configure(self.writer)
        self.commit(self.writer, 'base.txt', 'base')
        self.commit(self.writer, 'local.txt', 'original')
        self.run_git(self.writer, 'push', '-u', 'origin', 'main')
        self.run_git(self.root, 'clone', str(self.remote), str(self.tree))
        self.configure(self.tree)

    def run_git(self, tree, *args):
        return subprocess.run(['git', '-C', str(tree), *args], check=True, text=True, capture_output=True).stdout.strip()

    def configure(self, tree):
        self.run_git(tree, 'config', 'user.email', 'irm@example.test')
        self.run_git(tree, 'config', 'user.name', 'Tit Test')

    def commit(self, tree, filename, content):
        (tree / filename).write_text(content)
        self.run_git(tree, 'add', filename)
        self.run_git(tree, 'commit', '-m', 'fixture update')

    def remote_update(self, filename='remote.txt'):
        self.commit(self.writer, filename, 'remote change')
        self.run_git(self.writer, 'push')

    def pull(self):
        with contextlib.redirect_stdout(io.StringIO()):
            git_sync.pull(self.tree)

    def test_check_fetches_remote_without_changing_head_or_local_files(self):
        before = self.run_git(self.tree, 'rev-parse', 'HEAD')
        (self.tree / 'local.txt').write_text('pending')
        self.remote_update()
        result = git_sync.check_updates(self.tree)
        self.assertEqual((result['state'], result['behind']), ('behind', 1))
        self.assertEqual(self.run_git(self.tree, 'rev-parse', 'HEAD'), before)
        self.assertEqual((self.tree / 'local.txt').read_text(), 'pending')
        self.assertFalse((self.tree / 'remote.txt').exists())

    def test_fast_forward_preserves_unrelated_pending_changes_despite_autostash_config(self):
        self.remote_update()
        (self.tree / 'local.txt').write_text('pending')
        (self.tree / 'untracked.txt').write_text('keep')
        self.run_git(self.tree, 'config', 'pull.rebase', 'true')
        self.run_git(self.tree, 'config', 'rebase.autoStash', 'true')
        self.run_git(self.tree, 'config', 'merge.autoStash', 'true')
        self.pull()
        self.assertEqual((self.tree / 'remote.txt').read_text(), 'remote change')
        self.assertEqual((self.tree / 'local.txt').read_text(), 'pending')
        self.assertEqual((self.tree / 'untracked.txt').read_text(), 'keep')
        self.assertEqual(self.run_git(self.tree, 'stash', 'list'), '')
        self.assertEqual(git_sync.check_updates(self.tree, fetch=False)['state'], 'current')

    def test_overlapping_local_changes_are_not_stashed_or_overwritten(self):
        (self.tree / 'local.txt').write_text('pending')
        self.remote_update('local.txt')
        before = self.run_git(self.tree, 'rev-parse', 'HEAD')
        with self.assertRaisesRegex(ValueError, 'local changes'):
            self.pull()
        self.assertEqual((self.tree / 'local.txt').read_text(), 'pending')
        self.assertEqual(self.run_git(self.tree, 'rev-parse', 'HEAD'), before)
        self.assertEqual(self.run_git(self.tree, 'stash', 'list'), '')

    def test_diverged_history_is_reported_and_never_merged_or_rebased(self):
        self.commit(self.tree, 'ours.txt', 'local commit')
        self.remote_update()
        result = git_sync.check_updates(self.tree)
        self.assertEqual((result['state'], result['ahead'], result['behind']), ('diverged', 1, 1))
        before = self.run_git(self.tree, 'rev-parse', 'HEAD')
        with self.assertRaisesRegex(ValueError, 'diverged'):
            self.pull()
        self.assertEqual(self.run_git(self.tree, 'rev-parse', 'HEAD'), before)

    def test_ahead_only_and_current_are_not_reported_as_remote_updates(self):
        self.assertEqual(git_sync.check_updates(self.tree)['state'], 'current')
        self.commit(self.tree, 'ours.txt', 'local commit')
        self.assertEqual(git_sync.check_updates(self.tree)['state'], 'ahead')

    def test_selected_feature_branch_uses_its_upstream_not_main_or_shell_directory(self):
        self.run_git(self.writer, 'checkout', '-b', 'feature')
        self.run_git(self.writer, 'push', '-u', 'origin', 'feature')
        self.run_git(self.tree, 'fetch')
        self.run_git(self.tree, 'worktree', 'add', str(self.root / 'feature tree'), '-b', 'feature', 'origin/feature')
        selected = self.root / 'feature tree'
        self.remote_update()
        before = self.run_git(self.tree, 'rev-parse', 'HEAD')
        with patch.object(irm, 'active', return_value=selected), patch.object(irm, 'STATE', self.root), contextlib.redirect_stdout(io.StringIO()):
            irm.main(['pull'])
        self.assertTrue((selected / 'remote.txt').exists())
        self.assertEqual(self.run_git(self.tree, 'rev-parse', 'HEAD'), before)

    def test_missing_upstream_and_detached_head_have_actionable_errors(self):
        self.run_git(self.tree, 'branch', '--unset-upstream')
        self.assertIn('no upstream', git_sync.check_updates(self.tree)['message'])
        with self.assertRaisesRegex(ValueError, 'no upstream'):
            self.pull()
        self.run_git(self.tree, 'checkout', '--detach')
        self.assertIn('Detached HEAD', git_sync.check_updates(self.tree)['message'])

    def test_unreachable_remote_does_not_block_local_status_or_touch_files(self):
        self.run_git(self.tree, 'remote', 'set-url', 'origin', str(self.root / 'missing-private-remote'))
        before = self.run_git(self.tree, 'rev-parse', 'HEAD')
        result = git_sync.check_updates(self.tree)
        self.assertEqual(result['state'], 'unavailable')
        self.assertNotIn('missing-private-remote', result['message'])
        self.assertEqual(self.run_git(self.tree, 'rev-parse', 'HEAD'), before)

    def test_timeout_is_reported_without_crashing_dashboard_check(self):
        with patch.object(git_sync, 'git', side_effect=subprocess.TimeoutExpired('git', 30)):
            self.assertIn('timed out', git_sync.check_updates(self.tree)['message'])

    def test_plain_start_checks_remote_once_but_status_does_not_fetch(self):
        with patch.object(irm, 'active', return_value=self.tree), patch.object(irm, 'STATE', self.root), patch.object(irm, 'status_lines', return_value=['Local app ready']), patch.object(irm.sys.stdin, 'isatty', return_value=False), patch.object(git_sync, 'check_updates', return_value={'message': 'Up to date'}) as check, contextlib.redirect_stdout(io.StringIO()):
            irm.main([])
            check.assert_called_once_with(self.tree)
            check.reset_mock()
            irm.main(['status'])
            check.assert_not_called()

    def test_older_backend_without_git_sync_uses_installed_fallback(self):
        backend = self.tree / 'tools/irm/irm.py'
        backend.parent.mkdir(parents=True)
        backend.touch()
        backend.with_name('capabilities.json').write_text(json.dumps({'platforms': ['Darwin', 'Linux'], 'network_modes': ['auto']}))
        cfg = self.root / 'config.json'
        cfg.write_text(json.dumps({'worktree': str(self.tree), 'network': 'auto'}))
        for command in (None, 'pull', 'updates'):
            self.assertEqual(launch.backend_path(cfg, self.root, command), self.root / 'irm.py')
