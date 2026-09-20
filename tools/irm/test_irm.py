import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import irm


class MigrationTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.tree = Path(directory).resolve()
        (self.tree / 'supabase').mkdir()
        (self.tree / 'supabase/config.toml').write_text('project_id = "church"\n[db]\nport = 54422\n')
        self.enterContext(patch.object(irm, 'active', return_value=self.tree))
        self.env = self.enterContext(patch.object(irm, 'read_environment', return_value={
            'direct_url': 'postgresql://postgres:db-test-password@127.0.0.1:54422/postgres'}))
        self.ready = self.enterContext(patch.object(irm, 'require_supabase'))
        self.call = self.enterContext(patch.object(irm, 'call'))
        self.stream = self.enterContext(contextlib.redirect_stdout(io.StringIO()))

    def test_only_drizzle_selected_tree_and_validated_url(self):
        irm.migrate_local(self.tree)
        self.assertEqual(self.call.call_args.args[0], ['bun', 'run', 'db:migrate'])
        self.assertEqual(self.call.call_args.kwargs['cwd'], self.tree)
        self.assertEqual(self.call.call_args.kwargs['env']['DIRECT_URL'], self.env.return_value['direct_url'])
        self.assertTrue(self.call.call_args.kwargs['capture_output'])
        self.assertNotIn('db-test-password', self.stream.getvalue())

    def test_hosted_wrong_port_and_missing_urls_never_migrate(self):
        for url in ('postgresql://postgres:secret@example.com:54422/postgres',
                    'postgresql://postgres:secret@localhost:54322/postgres',
                    'postgresql://localhost:54422/other', '', 'invalid'):
            self.env.return_value = {'direct_url': url}
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, 'local Postgres'):
                irm.migrate_local(self.tree)
        self.call.assert_not_called()

    def test_failure_redacts_credentials(self):
        self.call.side_effect = subprocess.CalledProcessError(1, ['bun'], stderr='private')
        with self.assertRaisesRegex(ValueError, 'Local Drizzle migration failed') as error:
            irm.migrate_local(self.tree)
        self.assertNotIn('private', str(error.exception))

    def test_not_ready_never_migrates(self):
        self.ready.side_effect = ValueError('not ready')
        with self.assertRaises(ValueError):
            irm.migrate_local(self.tree)
        self.call.assert_not_called()


class ServiceBatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tree = Path(self.temp.name).resolve()
        self.enterContext(patch.object(irm, 'STATE', self.tree))
        self.enterContext(patch.object(irm, 'active', return_value=self.tree))
        self.start = self.enterContext(patch.object(irm, 'start'))
        self.stop = self.enterContext(patch.object(irm, 'stop'))
        self.enterContext(patch.object(irm, 'status_lines', return_value=[]))
        self.enterContext(contextlib.redirect_stdout(io.StringIO()))

    def scripts(self, scripts):
        (self.tree / 'package.json').write_text(json.dumps({'scripts': scripts}))

    def test_missing_storybook_blocks_default_and_explicit_batches_before_side_effects(self):
        self.scripts({'dev': 'next dev'})
        for args in (['run'], ['run', 'all'], ['restart'], ['restart', 'all']):
            with self.subTest(args=args), self.assertRaisesRegex(ValueError, "No usable 'storybook' script"):
                irm.main(args)
            self.start.assert_not_called()
            self.stop.assert_not_called()

    def test_empty_or_non_string_scripts_are_rejected_before_start(self):
        for script in ('', '  ', None, 1):
            with self.subTest(script=script):
                self.scripts({'dev': 'next dev', 'storybook': script})
                with self.assertRaisesRegex(ValueError, 'storybook'):
                    irm.main(['run', 'all'])
                self.start.assert_not_called()

    def test_single_available_service_does_not_require_storybook(self):
        self.scripts({'dev': 'next dev'})
        irm.main(['run', 'dev'])
        self.start.assert_called_once_with('dev')
        self.stop.assert_not_called()

    def test_supported_batch_starts_both_services(self):
        self.scripts({'dev': 'next dev', 'storybook': 'storybook dev'})
        irm.main(['run', 'all'])
        self.assertEqual([entry.args[0] for entry in self.start.call_args_list], ['dev', 'storybook'])
        self.stop.assert_not_called()

    def test_supported_restart_stops_before_starting(self):
        self.scripts({'dev': 'next dev', 'storybook': 'storybook dev'})
        events = []
        self.stop.side_effect = lambda service: events.append(('stop', service))
        self.start.side_effect = lambda service: events.append(('start', service))
        irm.main(['restart', 'all'])
        self.assertEqual(events, [('stop', 'dev'), ('stop', 'storybook'), ('start', 'dev'), ('start', 'storybook')])

    def test_stop_all_does_not_require_package_or_scripts(self):
        irm.main(['stop', 'all'])
        self.assertEqual([entry.args[0] for entry in self.stop.call_args_list], ['dev', 'storybook'])
        self.start.assert_not_called()


if __name__ == '__main__':
    unittest.main()
