import argparse
import contextlib
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import irm


class CleanupTests(unittest.TestCase):
    def setUp(self):
        temp = self.enterContext(tempfile.TemporaryDirectory())
        self.repo = Path(temp).resolve() / 'repo'
        self.repo.mkdir()
        self.git('init', '-b', 'main')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'user.name', 'Test')
        self.git('commit', '--allow-empty', '-m', 'initial')
        self.tree = Path(temp).resolve() / 'feature'
        self.git('worktree', 'add', '-b', 'feature', str(self.tree))
        self.enterContext(patch.object(irm, 'config', return_value={'repo': str(self.repo), 'worktree': str(self.repo)}))
        self.enterContext(patch.object(irm, 'running', return_value=False))
        self.enterContext(contextlib.redirect_stdout(io.StringIO()))

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo), *args], check=True, capture_output=True, text=True)

    def report(self):
        return next(t for t in irm.cleanup_report('main') if t['path'] == str(self.tree))

    def args(self, **changes):
        return argparse.Namespace(base='main', no_fetch=True, json=False, dry_run=False,
                                  delete_branches=False, **changes)

    def test_merged_and_primary(self):
        self.assertTrue(self.report()['eligible'])
        primary = irm.cleanup_report('main')[0]
        self.assertFalse(primary['eligible'])
        self.assertIn('primary worktree', primary['reasons'])

    def test_unmerged_and_dirty(self):
        subprocess.run(['git', '-C', str(self.tree), 'commit', '--allow-empty', '-m', 'pending'], check=True, capture_output=True)
        self.assertFalse(self.report()['merged'])
        (self.tree / 'untracked').touch()
        self.assertIn('uncommitted changes', self.report()['reasons'])

    def test_active_running_locked_and_current_directory(self):
        with patch.object(irm, 'active', return_value=self.tree):
            self.assertIn('active worktree', self.report()['reasons'])
        with patch.object(irm, 'running', return_value=True), patch.object(irm, 'session_tree', return_value=str(self.tree)):
            self.assertFalse(self.report()['eligible'])
        with patch.object(irm.Path, 'cwd', return_value=self.tree):
            self.assertIn('current directory', self.report()['reasons'])
        self.git('worktree', 'lock', str(self.tree))
        self.assertIn('locked worktree', self.report()['reasons'])

    def test_dry_run_and_noninteractive_do_not_prompt(self):
        with patch('builtins.input') as prompt, patch.object(irm.sys.stdin, 'isatty', return_value=False):
            irm.cleanup(self.args())
            prompt.assert_not_called()
        args = self.args()
        args.dry_run = True
        with patch('builtins.input') as prompt, patch.object(irm.sys.stdin, 'isatty', return_value=True):
            irm.cleanup(args)
            prompt.assert_not_called()
        self.assertTrue(self.tree.exists())

    def test_confirm_removes_only_worktree_and_keeps_branch(self):
        with patch('builtins.input', return_value='yes'), patch.object(irm.sys.stdin, 'isatty', return_value=True):
            irm.cleanup(self.args())
        self.assertFalse(self.tree.exists())
        self.git('show-ref', '--verify', 'refs/heads/feature')

    def test_decline_keeps_worktree(self):
        with patch('builtins.input', return_value=''), patch.object(irm.sys.stdin, 'isatty', return_value=True):
            irm.cleanup(self.args())
        self.assertTrue(self.tree.exists())

    def test_new_changes_after_prompt_prevent_removal(self):
        def confirm(_):
            (self.tree / 'new-file').touch()
            return 'yes'
        with patch('builtins.input', side_effect=confirm), patch.object(irm.sys.stdin, 'isatty', return_value=True):
            irm.cleanup(self.args())
        self.assertTrue(self.tree.exists())

    def test_invalid_base_fails_closed(self):
        with self.assertRaises(subprocess.CalledProcessError):
            irm.cleanup_report('missing-ref')
        self.assertTrue(self.tree.exists())

    def test_fetch_failure_prevents_removal(self):
        args = self.args()
        args.no_fetch = False
        with patch.object(irm, 'call', side_effect=subprocess.CalledProcessError(1, 'fetch')), patch('builtins.input') as prompt:
            with self.assertRaises(subprocess.CalledProcessError):
                irm.cleanup(args)
            prompt.assert_not_called()
        self.assertTrue(self.tree.exists())

    def test_json_does_not_prompt(self):
        args = self.args()
        args.json = True
        with patch('builtins.input') as prompt:
            irm.cleanup(args)
            prompt.assert_not_called()
        self.assertTrue(self.tree.exists())

    def test_detached_worktree_is_protected(self):
        subprocess.run(['git', '-C', str(self.tree), 'checkout', '--detach'], check=True, capture_output=True)
        self.assertIn('detached HEAD', self.report()['reasons'])

    def test_custom_local_base_is_protected_by_short_and_full_ref(self):
        for base in ('feature', 'refs/heads/feature'):
            with self.subTest(base=base):
                tree = next(t for t in irm.cleanup_report(base) if t['path'] == str(self.tree))
                self.assertTrue(tree['merged'])
                self.assertFalse(tree['eligible'])
                self.assertIn('selected merge target', tree['reasons'])

    def test_custom_remote_base_protects_matching_local_branch(self):
        self.git('remote', 'add', 'origin', str(self.repo))
        self.git('update-ref', 'refs/remotes/origin/release', 'HEAD')
        self.git('branch', '-m', 'feature', 'release')
        for base in ('origin/release', 'refs/remotes/origin/release'):
            with self.subTest(base=base):
                tree = next(t for t in irm.cleanup_report(base) if t['path'] == str(self.tree))
                self.assertFalse(tree['eligible'])
                self.assertIn('selected merge target', tree['reasons'])

    def test_cleanup_never_prompts_to_remove_custom_base(self):
        args = self.args()
        args.base = 'feature'
        args.delete_branches = True
        with patch('builtins.input') as prompt, patch.object(irm.sys.stdin, 'isatty', return_value=True):
            irm.cleanup(args)
            prompt.assert_not_called()
        self.assertTrue(self.tree.exists())
        self.git('show-ref', '--verify', 'refs/heads/feature')

    def test_commit_base_still_allows_merged_feature_cleanup(self):
        base = self.git('rev-parse', 'HEAD').stdout.strip()
        tree = next(t for t in irm.cleanup_report(base) if t['path'] == str(self.tree))
        self.assertTrue(tree['eligible'])

    def test_feature_tracking_integration_ref_remains_eligible(self):
        self.git('remote', 'add', 'origin', str(self.repo))
        self.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
        self.git('branch', '--set-upstream-to=origin/main', 'feature')
        tree = next(t for t in irm.cleanup_report('origin/main') if t['path'] == str(self.tree))
        self.assertTrue(tree['eligible'])
