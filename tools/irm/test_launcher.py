import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import install
import launch
import irm


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.cfg = self.root / 'config.json'

    def test_follows_saved_worktree_on_every_invocation(self):
        for branch in ('first', 'second with spaces'):
            tree = self.root / branch
            backend = tree / 'tools/irm/irm.py'
            backend.parent.mkdir(parents=True)
            backend.touch()
            backend.with_name("capabilities.json").write_text(json.dumps({"features": ["git-sync"], "platforms": ["Darwin", "Linux"], "network_modes": ["auto", "local", "lan", "tailscale"]}))
            self.cfg.write_text(json.dumps({'worktree': str(tree)}))
            self.assertEqual(launch.backend_path(self.cfg, self.root), backend)

    def test_old_branch_or_missing_config_uses_installed_fallback(self):
        self.assertEqual(launch.backend_path(self.cfg, self.root), self.root / 'irm.py')
        self.cfg.write_text(json.dumps({'worktree': str(self.root / 'old')}))
        self.assertEqual(launch.backend_path(self.cfg, self.root), self.root / 'irm.py')

    def test_invalid_config_is_not_silently_ignored(self):
        self.cfg.write_text('{')
        with self.assertRaises(ValueError):
            launch.backend_path(self.cfg, self.root)

    def test_install_replaces_symlink_but_preserves_regular_files(self):
        launcher = self.root / 'launch.py'
        launcher.touch()
        bin_dir = self.root / 'bin'
        target = install.install(bin_dir, launcher)
        self.assertEqual(target.resolve(), launcher)
        self.assertEqual(install.install(bin_dir, launcher), target)
        target.unlink()
        target.write_text('existing executable')
        with self.assertRaises(ValueError):
            install.install(bin_dir, launcher)
        self.assertEqual(target.read_text(), 'existing executable')

    def test_theme_preserves_existing_configuration(self):
        self.cfg.write_text(json.dumps({'worktree': '/tree', 'env_source': '/private', 'network': 'lan'}))
        with patch.object(irm, 'CONFIG', self.cfg), patch.object(irm, 'STATE', self.root), contextlib.redirect_stdout(io.StringIO()):
            irm.main(['theme', 'light'])
        self.assertEqual(json.loads(self.cfg.read_text()), {'worktree': '/tree', 'env_source': '/private', 'network': 'lan', 'theme': 'light'})

    def test_ui_state_excludes_private_config_and_distinguishes_occupied_ports(self):
        with patch.object(irm, 'address', return_value='localhost'), patch.object(irm, 'active', return_value=Path('/tree')), patch.object(irm, 'trees', return_value=[('/tree', 'main')]), patch.object(irm, 'running', side_effect=[True, False]), patch.object(irm, 'occupied', return_value=True), patch.object(irm, 'session_tree', return_value='/other'), patch.object(irm, 'config', return_value={'env_source': '/private'}):
            data = irm.dashboard_data()
        self.assertNotIn('/private', json.dumps(data))
        self.assertEqual([s['state'] for s in data['services']], ['running', 'occupied'])
        self.assertEqual(data['services'][0]['worktree'], '/other')

    def test_same_tree_selection_is_safe_with_running_services(self):
        with patch.object(irm, 'active', return_value=Path('/tree')), patch.object(irm, 'resolve', return_value=Path('/tree')), patch.object(irm, 'running') as running, patch.object(irm, 'save') as save, contextlib.redirect_stdout(io.StringIO()):
            irm.select_tree('/tree')
        running.assert_not_called()
        save.assert_not_called()

    def test_other_tree_selection_is_blocked_with_running_services(self):
        with patch.object(irm, 'active', return_value=Path('/tree')), patch.object(irm, 'resolve', return_value=Path('/other')), patch.object(irm, 'running', return_value=True), patch.object(irm, 'save') as save:
            with self.assertRaisesRegex(ValueError, 'Stop managed services'):
                irm.select_tree('/other')
        save.assert_not_called()
