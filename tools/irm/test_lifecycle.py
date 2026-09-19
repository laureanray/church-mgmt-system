import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import irm


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory())).resolve()
        self.repo = self.root / 'repo'
        self.remote = self.root / 'remote.git'
        subprocess.run(['git', 'init', '--bare', str(self.remote)], check=True, capture_output=True)
        subprocess.run(['git', 'init', '-b', 'main', str(self.repo)], check=True, capture_output=True)
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'user.name', 'Test')
        (self.repo / '.gitignore').write_text('.env\nnode_modules/\n')
        self.git('add', '.')
        self.git('commit', '-m', 'initial')
        self.git('remote', 'add', 'origin', str(self.remote))
        self.git('push', '-u', 'origin', 'main')
        self.cfg = self.root / 'config.json'
        self.enterContext(patch.object(irm, 'CONFIG', self.cfg))
        self.enterContext(patch.object(irm, 'STATE', self.root / 'state'))
        irm.save({'repo': str(self.repo), 'worktree': str(self.repo)})
        self.enterContext(contextlib.redirect_stdout(io.StringIO()))

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo), *args], capture_output=True, text=True, check=True).stdout.strip()

    def test_creation_uses_fresh_main_and_has_no_upstream_or_implicit_switch(self):
        (self.repo / 'new-file').touch()
        self.git('add', '.')
        self.git('commit', '-m', 'new')
        self.git('push')
        irm.main(['new', 'feat/test', 'test'])
        tree = self.root / 'repo-test'
        self.assertEqual(subprocess.check_output(['git', '-C', str(tree), 'rev-parse', 'HEAD'], text=True).strip(), self.git('rev-parse', 'HEAD'))
        self.assertEqual(self.git('for-each-ref', '--format=%(upstream)', 'refs/heads/feat/test'), '')
        self.assertEqual(irm.active(), self.repo)
        self.assertEqual(irm.resolve('feat/test'), tree)
        with self.assertRaises(subprocess.CalledProcessError):
            irm.main(['new', 'feat/test', 'test'])

    def test_fetch_failure_leaves_no_new_branch_or_directory(self):
        self.git('remote', 'set-url', 'origin', str(self.root / 'missing'))
        with self.assertRaises(subprocess.CalledProcessError):
            irm.main(['new', 'feat/nope', 'nope'])
        self.assertFalse((self.root / 'repo-nope').exists())
        self.assertEqual(self.git('branch', '--list', 'feat/nope'), '')

    def test_setup_preserves_existing_env_and_requires_git_ignore(self):
        source = self.root / 'source.env'
        source.write_text('EXAMPLE=private-value')
        real_call = irm.call
        def command(args, **kwargs):
            if args[0] == 'bun':
                return subprocess.CompletedProcess(args, 0)
            return real_call(args, **kwargs)
        with patch.object(irm, 'call', side_effect=command) as call:
            irm.setup(str(source))
            self.assertEqual((self.repo / '.env').resolve(), source)
            call.assert_any_call(['bun', 'install', '--frozen-lockfile'], cwd=self.repo)
            other = self.root / 'other.env'
            other.write_text('other')
            with self.assertRaisesRegex(ValueError, 'already exists'):
                irm.setup(str(other))
            self.assertEqual((self.repo / '.env').resolve(), source)
            (self.repo / '.env').unlink()
            (self.repo / '.gitignore').write_text('')
            with self.assertRaisesRegex(ValueError, 'safely ignore'):
                irm.setup(str(source))

    def test_init_never_replaces_existing_configuration(self):
        before = self.cfg.read_text()
        with self.assertRaisesRegex(ValueError, 'already exists'):
            irm.initialize()
        self.assertEqual(self.cfg.read_text(), before)
        self.assertEqual(self.cfg.stat().st_mode & 0o777, 0o600)

    def test_ignored_local_config_blocks_cleanup_but_build_artifacts_do_not(self):
        irm.new_tree('feat/test', 'test')
        tree = self.root / 'repo-test'
        (tree / 'node_modules').mkdir()
        (tree / 'node_modules/cache').touch()
        with patch.object(irm, 'running', return_value=False):
            report = lambda: next(t for t in irm.cleanup_report('origin/main') if t['path'] == str(tree))
            self.assertTrue(report()['eligible'])
            (tree / '.env').write_text('SECRET=preserve')
            self.assertFalse(report()['eligible'])
            self.assertNotIn('preserve', json.dumps(report()))
            (tree / '.env').unlink()
            (tree / '.gitignore').write_text('modified tracked file')
            self.assertFalse(report()['eligible'])

    def test_pinned_bun_falls_back_without_global_upgrade(self):
        (self.repo / '.bun-version').write_text('1.4.2')
        with patch.object(irm.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '1.3.11\n')), patch.object(irm.shutil, 'which', return_value='/bin/bunx'):
            self.assertEqual(irm.bun_command(self.repo), ['bunx', 'bun@1.4.2'])
        (self.repo / '.bun-version').write_text('--unsafe')
        with self.assertRaisesRegex(ValueError, 'Invalid'):
            irm.bun_command(self.repo)


if __name__ == '__main__':
    unittest.main()
