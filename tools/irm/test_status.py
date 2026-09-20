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


class StatusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tree = Path(self.temp.name).resolve()
        (self.tree / 'supabase').mkdir()
        (self.tree / 'supabase/config.toml').write_text('project_id = "shop"')
        self.enterContext(patch.object(irm, 'active', return_value=self.tree))
        self.enterContext(patch.object(irm, 'config', return_value={'env_source': str(self.tree / 'source')}))
        self.enterContext(patch.object(irm, 'address', return_value='192.0.2.1'))

    def docker(self, states):
        rows = [{'Names': f'supabase_{name}_shop', 'State': state, 'Status': status}
                for name, state, status in states]
        rows.append({'Names': 'supabase_db_other', 'State': 'running', 'Status': 'Up (healthy)'})
        return subprocess.CompletedProcess([], 0, '\n'.join(map(json.dumps, rows)), '')

    def test_readiness_requires_all_core_services_and_ignores_other_projects(self):
        healthy = [(name, 'running', 'Up (healthy)') for name in ('db', 'auth', 'kong')]
        for states, expected in [(healthy, 'ready'), (healthy[:1], 'not ready'), ([], 'stopped'),
                                 (healthy[:2] + [('kong', 'running', 'Up (unhealthy)')], 'not ready'),
                                 (healthy[:2] + [('kong', 'running', 'Up (health: starting)')], 'not ready')]:
            with self.subTest(expected=expected), patch.object(irm, 'call', return_value=self.docker(states)):
                result = irm.supabase_status()
            self.assertEqual(result['state'], expected)
            self.assertNotIn('other', json.dumps(result))

    def test_docker_failure_does_not_expose_raw_error(self):
        with patch.object(irm, 'call', side_effect=subprocess.CalledProcessError(1, 'docker', stderr='secret')):
            result = irm.supabase_status()
        self.assertEqual(result['state'], 'unavailable')
        self.assertNotIn('secret', json.dumps(result))

    def test_startup_is_blocked_when_database_is_not_ready(self):
        with patch.object(irm, 'supabase_status', return_value={'state': 'not ready'}):
            with self.assertRaisesRegex(ValueError, 'irm supabase start'):
                irm.require_supabase()

    def test_stop_targets_only_selected_project_and_preserves_volumes(self):
        with patch.object(irm, 'running', return_value=False), patch.object(irm, 'call') as call, patch.object(irm, 'supabase_status', return_value={'state': 'stopped', 'project': 'shop', 'containers': []}), contextlib.redirect_stdout(io.StringIO()):
            irm.manage_supabase('stop')
        call.assert_called_once_with(['supabase', 'stop', '--project-id', 'shop'], cwd=self.tree, capture_output=True)

    def test_stop_refuses_while_dev_runs(self):
        with patch.object(irm, 'running', return_value=True), patch.object(irm, 'call') as call:
            with self.assertRaisesRegex(ValueError, 'Stop dev first'):
                irm.manage_supabase('stop')
        call.assert_not_called()

    def test_start_output_never_forwards_credentials(self):
        stream = io.StringIO()
        with patch.object(irm, 'call', return_value=subprocess.CompletedProcess([], 0, 'secret', 'secret')) as call, patch.object(irm, 'supabase_status', return_value={'state': 'ready', 'project': 'shop', 'containers': []}), contextlib.redirect_stdout(stream):
            irm.manage_supabase('start')
        self.assertNotIn('secret', stream.getvalue())
        call.assert_called_once_with(['supabase', 'start'], cwd=self.tree, capture_output=True)

    def test_failed_supabase_start_redacts_output(self):
        stream = io.StringIO()
        with patch.object(irm, 'call', side_effect=subprocess.CalledProcessError(1, 'supabase', output='secret', stderr='secret')), contextlib.redirect_stdout(stream):
            with self.assertRaisesRegex(ValueError, 'Supabase command failed') as caught:
                irm.manage_supabase('start')
        self.assertNotIn('secret', stream.getvalue() + str(caught.exception))

    def test_environment_reports_real_precedence_and_symlink_without_values(self):
        next_path = Path(__file__).resolve().parents[2] / 'node_modules/next'
        if not next_path.exists():
            self.skipTest('Run bun install for the real Next environment loader')
        (self.tree / 'node_modules').mkdir()
        (self.tree / 'node_modules/next').symlink_to(next_path.resolve())
        (self.tree / 'package.json').write_text(json.dumps({'scripts': {'dev': 'node agent-lab/dev.mjs'}}))
        source = self.tree / 'source'
        source.write_text('NEXT_PUBLIC_SUPABASE_URL=http://user:secret@localhost:54421/private?token=secret\nNEXT_PUBLIC_SUPABASE_ANON_KEY=file-secret\nDATABASE_URL=local-secret\n')
        (self.tree / '.env.local').symlink_to(source)
        (self.tree / '.env.development.local').write_text('NEXT_PUBLIC_SUPABASE_ANON_KEY=development-secret\n')
        keys = ('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV', '__NEXT_PROCESSED_ENV')
        clean_env = {k: v for k, v in os.environ.items() if k not in keys}
        with patch.dict(os.environ, clean_env, clear=True):
            report = irm.environment_status()
            encoded = json.dumps(report)
            self.assertNotIn('secret', encoded)
            self.assertEqual(report['endpoint'], 'http://192.0.2.1:54421')
            variables = {v['name']: v for v in report['variables']}
            self.assertEqual(variables['DATABASE_URL']['source'], '.env.local')
            self.assertEqual(variables['NEXT_PUBLIC_SUPABASE_ANON_KEY']['source'], '.env.development.local')
            local = next(f for f in report['files'] if f['name'] == '.env.local')
            self.assertEqual(local['source'], str(source))
            self.assertEqual(local['state'], 'linked')
            with patch.dict(os.environ, {'DATABASE_URL': ''}):
                variables = {v['name']: v for v in irm.environment_status()['variables']}
                self.assertEqual(variables['DATABASE_URL']['state'], 'empty')
                self.assertEqual(variables['DATABASE_URL']['source'], 'process environment')
            source.unlink()
            report = irm.environment_status()
            self.assertEqual(report['state'], 'incomplete')
            self.assertEqual(next(f for f in report['files'] if f['name'] == '.env.local')['state'], 'broken link')

    def test_endpoint_redacts_credentials_path_query_and_fragment(self):
        self.assertEqual(irm.safe_endpoint('https://user:secret@example.test/path?secret#secret'), 'https://example.test')
        self.assertEqual(irm.safe_endpoint('bad secret'), 'missing or invalid')
        self.assertEqual(irm.safe_endpoint('http://[::1]:54421'), 'http://[::1]:54421')


if __name__ == '__main__':
    unittest.main()
