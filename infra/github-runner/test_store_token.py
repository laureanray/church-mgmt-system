import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("store_token", Path(__file__).with_name("store-token.py"))
store = importlib.util.module_from_spec(spec)
spec.loader.exec_module(store)


class StoreTokenTests(unittest.TestCase):
    def invoke(self, result, rotate=False):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch("sys.argv", ["store-token.py"] + (["--rotate"] if rotate else [])), \
             patch("sys.stdin.isatty", return_value=True), \
             patch.object(store.getpass, "getpass", return_value="test-secret"), \
             patch.object(store.subprocess, "run", side_effect=[subprocess.CompletedProcess([], 0), result]) as run, \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = store.main()
        return code, stdout.getvalue(), stderr.getvalue(), run.call_args

    def test_token_only_sent_over_stdin(self):
        code, out, err, call = self.invoke(subprocess.CompletedProcess([], 0, "test-arn\n", ""))
        self.assertEqual(code, 0)
        self.assertEqual(out, "test-arn\n")
        self.assertNotIn("test-secret", str(call.args) + out + err)
        payload = json.loads(call.kwargs["input"])
        self.assertEqual(payload["Token"], "test-secret")
        self.assertIn("--secret-string", call.args[0])
        self.assertNotIn("--cli-input-json", call.args[0])
        self.assertIn("create-secret", call.args[0])

    def test_rotation_updates_existing_secret(self):
        _, _, _, call = self.invoke(subprocess.CompletedProcess([], 0, "test-arn\n", ""), rotate=True)
        self.assertIn("put-secret-value", call.args[0])
        argv = call.args[0]
        self.assertEqual(argv[argv.index("--secret-id") + 1], "church-mgmt/github-runner")

    def test_known_error_returns_fixed_guidance_without_raw_request(self):
        code, out, err, _ = self.invoke(subprocess.CompletedProcess([], 1, "", "An error occurred (ResourceExistsException): test-secret"))
        self.assertEqual(code, 1)
        self.assertIn("rerun with --rotate", err)
        self.assertNotIn("test-secret", out + err)

    def test_aws_error_cannot_echo_token(self):
        code, out, err, _ = self.invoke(subprocess.CompletedProcess([], 1, "test-secret", "request: test-secret"))
        self.assertEqual(code, 1)
        self.assertNotIn("test-secret", out + err)
        self.assertIn("Secret write failed", err)

    def test_authentication_failure_does_not_prompt_for_token(self):
        with patch("sys.argv", ["store-token.py"]), \
             patch.object(store.subprocess, "run", side_effect=subprocess.CalledProcessError(1, ["aws"])), \
             patch.object(store.getpass, "getpass") as prompt:
            with self.assertRaises(subprocess.CalledProcessError):
                store.main()
            prompt.assert_not_called()


if __name__ == "__main__":
    unittest.main()
