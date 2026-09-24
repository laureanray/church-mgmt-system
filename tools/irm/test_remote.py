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
import launch
import remote

SUPABASE = """
[api]
port = 54421
[db]
port = 54422
[studio]
port = 54423
[local_smtp]
port = 54424
"""


class PortAndHostTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tree = Path(self.temp.name)
        (self.tree / 'supabase').mkdir()
        (self.tree / 'supabase/config.toml').write_text(SUPABASE)
        self.enterContext(patch.dict(os.environ, {'PATH': os.environ['PATH']}, clear=True))

    def test_default_forwards_cover_app_storybook_supabase_and_offset_postgres(self):
        forwards, skipped, blocking = remote.plan_ports(self.tree, lambda port: False)
        self.assertEqual(forwards, [(3000, 3000), (6006, 6006), (54421, 54421), (54423, 54423),
                                    (54424, 54424), (54432, 54422)])
        self.assertEqual((skipped, blocking), ([], []))

    def test_local_app_or_auth_blocks_but_optional_ports_are_skipped(self):
        forwards, skipped, blocking = remote.plan_ports(self.tree, lambda port: port in (54421, 6006))
        self.assertEqual(blocking, [54421])
        self.assertEqual(skipped, [6006])
        self.assertNotIn((6006, 6006), forwards)
        with self.assertRaisesRegex(ValueError, 'irm stop all'):
            with patch.object(remote, 'choose_host', return_value='box'):
                remote.open_dashboard({}, self.tree, lambda port: port == 3000, [])

    def test_ports_override_accepts_local_remote_pairs(self):
        os.environ['IRM_REMOTE_PORTS'] = '3000, 15432:54422'
        self.assertEqual(remote.forward_ports(self.tree), [(3000, 3000, True), (15432, 54422, False)])

    def test_dashboard_runs_loopback_network_through_forwards(self):
        command = remote.dashboard_command('lr@box', [(3000, 3000), (54432, 54422)])
        self.assertEqual(command[:2], ['ssh', '-t'])
        self.assertIn('3000:127.0.0.1:3000', command)
        self.assertIn('54432:127.0.0.1:54422', command)
        self.assertEqual(command[-2], 'lr@box')
        self.assertTrue(command[-1].startswith('IRM_NETWORK=local '))
        self.assertTrue(command[-1].endswith(' irm'))

    def test_host_choice_tries_configured_hosts_in_order(self):
        results = [subprocess.CompletedProcess([], 255), subprocess.CompletedProcess([], 0)]
        with patch.object(remote.subprocess, 'run', side_effect=results) as run:
            self.assertEqual(remote.choose_host({'remote_hosts': ['lr@lan', 'lr@far']}), 'lr@far')
        self.assertEqual([c.args[0][-2] for c in run.call_args_list], ['lr@lan', 'lr@far'])
        os.environ['IRM_REMOTE_HOST'] = 'lr@override'
        self.assertEqual(remote.hosts({'remote_hosts': ['lr@lan']}), ['lr@override'])
        del os.environ['IRM_REMOTE_HOST']
        with self.assertRaisesRegex(ValueError, 'irm remote host'):
            remote.choose_host({})

    def test_network_override_wins_over_saved_mode(self):
        os.environ['IRM_NETWORK'] = 'local'
        with patch.object(irm, 'config', return_value={'network': 'lan'}):
            self.assertEqual(irm.address(), 'localhost')

    def test_worktree_root_moves_new_worktrees_out_of_the_projects_directory(self):
        self.assertEqual(remote.worktree_path({'repo': '/p/app'}, 'x'), Path('/p/app-x'))
        self.assertEqual(remote.worktree_path({'repo': '/p/app', 'worktree_root': '/w/app'}, 'x'), Path('/w/app/x'))

    def test_memory_directory_follows_claude_path_encoding(self):
        self.assertEqual(remote.memory_dir('/home/lr/projects/church-mgmt-system', '/c'),
                         Path('/c/projects/-home-lr-projects-church-mgmt-system/memory'))

    def test_launcher_uses_installed_manager_for_remote_on_older_worktrees(self):
        tree = self.tree / 'old'
        backend = tree / 'tools/irm/irm.py'
        backend.parent.mkdir(parents=True)
        backend.touch()
        backend.with_name('capabilities.json').write_text(json.dumps(
            {'features': ['git-sync'], 'platforms': ['Darwin', 'Linux'], 'network_modes': ['auto', 'local']}))
        cfg = self.tree / 'config.json'
        cfg.write_text(json.dumps({'worktree': str(tree)}))
        self.assertEqual(launch.backend_path(cfg, self.tree, 'remote'), self.tree / 'irm.py')
        self.assertEqual(launch.backend_path(cfg, self.tree, 'status'), backend)


class SyncTests(unittest.TestCase):
    """Laptop and remote as two clones of one origin; only SSH is replaced."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        origin = self.root / 'origin.git'
        self.git(self.root, 'init', '--bare', '--initial-branch=main', str(origin))
        seed = self.root / 'seed'
        self.git(self.root, 'clone', str(origin), str(seed))
        self.commit(seed, 'base.txt', 'base')
        self.git(seed, 'push', 'origin', 'main')
        self.laptop = self.root / 'laptop/app'
        self.box = self.root / 'box/projects/app'
        for clone in (self.laptop, self.box):
            self.git(self.root, 'clone', str(origin), str(clone))
            self.configure(clone)
        self.tree = self.root / 'laptop/app-feature'
        self.git(self.laptop, 'worktree', 'add', '-b', 'feat/x', str(self.tree))
        self.commit(self.tree, 'feature.txt', 'unpushed commit')
        (self.tree / 'base.txt').write_text('edited, not committed')
        (self.tree / 'notes').mkdir()
        (self.tree / 'notes/new.txt').write_text('untracked')
        self.worktrees = self.root / 'box/worktrees/app'
        self.cfg = self.root / 'config.json'
        self.cfg.write_text(json.dumps({'repo': str(self.box), 'worktree': str(self.box),
                                        'worktree_root': str(self.worktrees)}))
        self.enterContext(patch.object(remote, 'CONFIG', self.cfg))
        self.enterContext(patch.object(remote, 'STATE', self.root / 'state'))
        self.enterContext(patch.object(remote, 'services_running', return_value=False))

    def git(self, tree, *args):
        return subprocess.run(['git', '-C', str(tree), *args], check=True, text=True, capture_output=True).stdout.strip()

    def configure(self, tree):
        self.git(tree, 'config', 'user.email', 'irm@example.test')
        self.git(tree, 'config', 'user.name', 'Irm Test')

    def commit(self, tree, name, content):
        self.configure(tree)
        (tree / name).write_text(content)
        self.git(tree, 'add', name)
        self.git(tree, 'commit', '-m', 'fixture ' + name)

    def sync(self, force=False, memory=None):
        registered = [(str(self.laptop), 'main'), (str(self.tree), 'feat/x')]
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            entries = remote.collect(registered, registered)
            for entry in entries:
                self.git(self.laptop, 'push', '--quiet', '--force', str(self.box),
                         f"+{entry['sha']}:refs/remotes/laptop/{entry['branch']}")
            remote.receive(io.BytesIO(remote.payload(entries, memory, select='feature')), force=force)
        return output.getvalue()

    def test_mirrors_commit_edits_and_untracked_files_under_worktree_root(self):
        output = self.sync()
        mirror = self.worktrees / 'feature'
        self.assertIn('Skipped', output)  # the primary checkout never travels
        self.assertEqual(self.git(mirror, 'rev-parse', 'HEAD'), self.git(self.tree, 'rev-parse', 'HEAD'))
        self.assertEqual(self.git(mirror, 'branch', '--show-current'), 'feat/x')
        self.assertEqual((mirror / 'base.txt').read_text(), 'edited, not committed')
        self.assertEqual((mirror / 'notes/new.txt').read_text(), 'untracked')
        self.assertEqual(json.loads(self.cfg.read_text())['worktree'], str(mirror))
        self.assertFalse((self.box.parent / 'app-feature').exists())

    def test_edits_made_on_the_remote_survive_unless_forced(self):
        self.sync()
        mirror = self.worktrees / 'feature'
        (mirror / 'feature.txt').write_text('remote session work')
        self.assertIn('uncommitted edits made on this host', self.sync())
        self.assertEqual((mirror / 'feature.txt').read_text(), 'remote session work')
        self.sync(force=True)
        self.assertEqual((mirror / 'feature.txt').read_text(), 'unpushed commit')

    def test_resync_of_unchanged_mirror_is_not_mistaken_for_remote_edits(self):
        self.sync()
        (self.tree / 'base.txt').write_text('second edit')
        self.assertNotIn('[warn]', self.sync())
        self.assertEqual((self.worktrees / 'feature/base.txt').read_text(), 'second edit')

    def test_commits_made_on_the_remote_block_the_sync(self):
        self.sync()
        mirror = self.worktrees / 'feature'
        self.git(mirror, 'checkout', '--quiet', '--', '.')
        self.git(mirror, 'clean', '-fdq')
        self.commit(mirror, 'remote.txt', 'remote commit')
        head = self.git(mirror, 'rev-parse', 'HEAD')
        self.assertIn('commits made on this host', self.sync())
        self.assertEqual(self.git(mirror, 'rev-parse', 'HEAD'), head)

    def test_memory_is_copied_and_the_index_merged_without_deletes(self):
        laptop_memory = self.root / 'laptop-memory'
        laptop_memory.mkdir()
        (laptop_memory / 'MEMORY.md').write_text('# Laptop heading\n- [A](a.md) — laptop\n')
        (laptop_memory / 'a.md').write_text('laptop fact')
        box_memory = remote.memory_dir(self.box, self.root / 'claude')
        box_memory.mkdir(parents=True)
        (box_memory / 'MEMORY.md').write_text('# Memory\n- [B](b.md) — box\n')
        (box_memory / 'b.md').write_text('box fact')
        with patch.object(remote, 'memory_dir', return_value=box_memory):
            self.sync(memory=laptop_memory)
        self.assertEqual((box_memory / 'MEMORY.md').read_text(), '# Memory\n- [B](b.md) — box\n- [A](a.md) — laptop\n')
        self.assertEqual((box_memory / 'a.md').read_text(), 'laptop fact')
        self.assertEqual((box_memory / 'b.md').read_text(), 'box fact')


if __name__ == '__main__':
    unittest.main()
