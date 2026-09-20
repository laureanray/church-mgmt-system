import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import launch
import network
import irm


class NetworkTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ, {'PATH': '/usr/bin:/bin'}, clear=True))
        self.system = self.enterContext(patch.object(network.platform, 'system', return_value='Linux'))
        self.output = self.enterContext(patch.object(network, 'output'))
        self.which = self.enterContext(patch.object(network.shutil, 'which', return_value='/bin/tailscale'))

    def test_mac_is_local_even_with_vpn_and_inherited_ssh(self):
        self.system.return_value = 'Darwin'
        os.environ['SSH_CONNECTION'] = '100.64.1.1 22 100.64.1.2 22'
        self.assertEqual(network.address(), 'localhost')
        self.output.assert_not_called()
        self.which.assert_not_called()

    def test_local_linux_does_not_require_network_tools(self):
        self.assertEqual(network.address(), 'localhost')
        self.output.assert_not_called()

    def test_ssh_selects_server_not_client_address(self):
        for server in ('100.64.1.2', '192.168.1.22', '2001:db8::2'):
            os.environ['SSH_CONNECTION'] = f'192.168.1.5 4567 {server} 22'
            self.assertEqual(network.address(), server)
        self.output.assert_not_called()

    def test_incomplete_ssh_uses_available_tailscale_then_lan(self):
        os.environ['SSH_TTY'] = '/dev/pts/1'
        self.output.return_value = '100.64.1.2'
        self.assertEqual(network.address(), '100.64.1.2')
        self.which.return_value = None
        self.output.side_effect = ['[{"dev":"eth0"}]', '[{"addr_info":[{"scope":"global","local":"192.168.1.2"}]}]']
        self.assertEqual(network.address(), '192.168.1.2')

    def test_explicit_modes_override_auto(self):
        self.system.return_value = 'Darwin'
        self.output.return_value = '100.64.1.2'
        self.assertEqual(network.address('tailscale'), '100.64.1.2')
        self.assertEqual(network.address('local'), 'localhost')

    def test_mac_lan_uses_native_commands(self):
        self.system.return_value = 'Darwin'
        self.output.side_effect = ['route to: default\n interface: en0\n', '192.168.1.2']
        self.assertEqual(network.address('lan'), '192.168.1.2')
        self.assertEqual(self.output.call_args_list[1].args[0], ['/usr/sbin/ipconfig', 'getifaddr', 'en0'])

    def test_linux_lan_skips_tailscale_interface(self):
        self.output.side_effect = ['[{"dev":"tailscale0"},{"dev":"eth0"}]', '[{"addr_info":[{"scope":"global","local":"192.168.1.2"}]}]']
        self.assertEqual(network.address('lan'), '192.168.1.2')

    def test_failures_are_actionable_and_do_not_silently_use_loopback_remotely(self):
        self.which.return_value = None
        with self.assertRaisesRegex(ValueError, 'No Tailscale'):
            network.address('tailscale')
        self.output.side_effect = FileNotFoundError()
        os.environ['SSH_CLIENT'] = '192.168.1.5 1234 22'
        with self.assertRaisesRegex(ValueError, 'No LAN'):
            network.address()
        with self.assertRaisesRegex(ValueError, 'Unknown network'):
            network.address('bogus')

    def test_browser_url_brackets_ipv6_and_preserves_hosted_supabase(self):
        with patch.object(irm, 'address', return_value='2001:db8::2'):
            self.assertEqual(irm.browser_url('http://127.0.0.1:54421/path'), 'http://[2001:db8::2]:54421/path')
            self.assertEqual(irm.browser_url('https://example.supabase.co'), 'https://example.supabase.co')
        with patch.object(irm, 'address', return_value='localhost'):
            self.assertEqual(irm.browser_url('http://127.0.0.1:54421'), 'http://127.0.0.1:54421')

    def test_unavailable_override_does_not_replace_working_config(self):
        with tempfile.TemporaryDirectory() as directory:
            cfg = Path(directory).resolve() / 'config.json'
            cfg.write_text('{"network":"auto"}')
            self.which.return_value = None
            with patch.object(irm, 'CONFIG', cfg), patch.object(irm, 'STATE', Path(directory).resolve()):
                with self.assertRaises(ValueError):
                    irm.main(['network', 'tailscale'])
            self.assertEqual(json.loads(cfg.read_text())['network'], 'auto')

    def test_older_worktrees_use_installed_manager_for_auto_and_mac(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            backend = root / 'tree/tools/irm/irm.py'
            backend.parent.mkdir(parents=True)
            backend.touch()
            cfg = root / 'config.json'
            for system, mode in [('Darwin', 'auto'), ('Darwin', 'lan'), ('Linux', 'auto'), ('Linux', 'local')]:
                cfg.write_text(json.dumps({'worktree': str(root / 'tree'), 'network': mode}))
                self.system.return_value = system
                self.assertEqual(launch.backend_path(cfg, root), root / 'irm.py')
            self.system.return_value = 'Linux'
            cfg.write_text(json.dumps({'worktree': str(root / 'tree'), 'network': 'lan'}))
            self.assertEqual(launch.backend_path(cfg, root, "status"), backend)

    def test_start_binds_local_servers_to_loopback_and_remote_servers_to_network(self):
        with tempfile.TemporaryDirectory() as directory:
            tree = Path(directory).resolve()
            (tree / 'package.json').write_text(json.dumps({'scripts': {'dev': 'next dev', 'storybook': 'storybook dev'}}))
            (tree / 'node_modules').mkdir()
            (tree / 'node_modules/next').mkdir()
            (tree / 'node_modules/next/package.json').touch()
            for service in ('dev', 'storybook'):
                for host, bind in [('localhost', '127.0.0.1'), ('100.64.1.2', '0.0.0.0'), ('2001:db8::2', '::')]:
                    with self.subTest(service=service, host=host), patch.object(irm, 'active', return_value=tree), patch.object(irm, 'STATE', tree), patch.object(irm, 'running', side_effect=[False, True]), patch.object(irm, 'occupied', side_effect=[False, True]), patch.object(irm, 'setup'), patch.object(irm, 'read_environment', return_value={'url': 'http://localhost:54421'}), patch.object(irm, 'require_supabase'), patch.object(irm, 'migrate_local'), patch.object(irm, 'address', return_value=host), patch.object(irm, 'supabase_settings', return_value=('', '')), patch.object(irm, 'call') as call, contextlib.redirect_stdout(io.StringIO()):
                        irm.start(service)
                        args = call.call_args_list[0].args[0]
                        flag = '--hostname' if service == 'dev' else '--host'
                        self.assertIn(f'{flag} {bind}', args[-1])
                        self.assertIn('IRM_DEV_HOST=' + host, args)


class MacProcessTests(unittest.TestCase):
    def test_snapshot_and_identity_use_native_ps(self):
        with patch.object(irm.platform, 'system', return_value='Darwin'), patch.object(irm, 'output', return_value='123 1 Fri Sep 11 22:00:00 2026    \n124 123 Fri Sep 11 22:00:01 2026    \n125 1 Fri Sep 11 22:00:02 2026'):
            self.assertEqual(irm.process_snapshot()[124], (123, 'Fri Sep 11 22:00:01 2026'))
        with patch.object(irm.platform, 'system', return_value='Darwin'), patch.object(irm, 'output', return_value='Fri Sep 11 22:00:01 2026'):
            self.assertTrue(irm.process_matches(124, 'Fri Sep 11 22:00:01 2026'))
            self.assertFalse(irm.process_matches(124, 'Fri Sep 11 22:00:00 2026'))

    def test_stop_only_terminates_matching_descendants_of_managed_session(self):
        with patch.object(irm, 'running', return_value=True), patch.object(irm, 'session_tree', return_value='/tree'), patch.object(irm, 'output', return_value='100'), patch.object(irm, 'process_snapshot', return_value={101: (100, 'start'), 102: (101, 'reused'), 999: (1, 'unrelated')}), patch.object(irm, 'process_matches', side_effect=lambda pid, start: start == 'start'), patch.object(irm.os, 'kill') as kill, patch.object(irm, 'call'), patch.object(irm, 'occupied', return_value=False), contextlib.redirect_stdout(io.StringIO()):
            irm.stop('dev')
            kill.assert_called_once_with(101, irm.signal.SIGTERM)
