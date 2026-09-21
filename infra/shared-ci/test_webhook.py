import base64
import hashlib
import hmac
import json
import types
import unittest

from webhook import apply_event, decode, trusted_run


class ConditionFailed(Exception):
    pass


class Table:
    def __init__(self):
        self.items = {}
        self.meta = types.SimpleNamespace(client=types.SimpleNamespace(
            exceptions=types.SimpleNamespace(ConditionalCheckFailedException=ConditionFailed)))

    def put_item(self, Item):
        self.items[Item["id"]] = Item

    def update_item(self, Key, ExpressionAttributeValues, **kwargs):
        item = self.items.setdefault(Key["id"], {})
        v = ExpressionAttributeValues
        if ":rank" in v:
            if item.get("event_rank", -1) > v[":rank"]:
                raise ConditionFailed()
            item.update(event_rank=v[":rank"], status=v[":s"])
        else:
            item.update(received=v[":yes"])


class WebhookTests(unittest.TestCase):
    def test_valid_signature_covers_exact_body_including_base64_transport(self):
        raw = b'{"repository":{"full_name":"owner/repo"}}'
        signature = "sha256=" + hmac.new(b"secret", raw, hashlib.sha256).hexdigest()
        for encoded in [False, True]:
            event = {"headers": {"X-Hub-Signature-256": signature}, "isBase64Encoded": encoded,
                     "body": base64.b64encode(raw).decode() if encoded else raw.decode()}
            self.assertEqual(decode(event, "secret")[0], json.loads(raw))

    def test_rejects_unsigned_or_tampered_body(self):
        for headers in [{}, {"x-hub-signature-256": "sha256=incorrect"}]:
            with self.assertRaises(ValueError):
                decode({"headers": headers, "body": "{}"}, "secret")

    def test_fork_and_missing_source_metadata_are_not_trusted(self):
        for head in [None, {}, {"full_name": "other/fork"}]:
            self.assertFalse(trusted_run({"event": "pull_request", "head_repository": head}, "owner/repo"))
        self.assertTrue(trusted_run({"event": "pull_request", "head_repository": {"full_name": "owner/repo"}}, "owner/repo"))
        self.assertFalse(trusted_run({"event": "pull_request_target"}, "owner/repo"))

    def test_rejects_unlisted_repository_even_with_valid_event_shape(self):
        with self.assertRaises(ValueError):
            apply_event(Table(), {"repository": {"full_name": "other/repo"}}, {}, {"owner/repo": "secret"}, 100)

    def test_delayed_queued_event_cannot_resurrect_completed_job(self):
        table = Table()
        payload = {"repository": {"full_name": "owner/repo"}, "workflow_job": {
            "id": 1, "run_id": 2, "name": "Tests", "labels": ["ec2-shared-ci-1-2-1-tests"], "status": "completed"}}
        headers = {"x-github-event": "workflow_job", "x-github-delivery": "delivery"}
        apply_event(table, payload, headers, {"owner/repo": "secret"}, 100)
        payload["workflow_job"]["status"] = "queued"
        apply_event(table, payload, headers, {"owner/repo": "secret"}, 101)
        self.assertEqual(table.items["job#1"]["status"], "completed")
        self.assertTrue(table.items["delivery#delivery"]["received"])

    def test_ordinary_codebuild_job_does_not_enter_vm_queue(self):
        table = Table()
        payload = {"repository": {"full_name": "owner/repo"}, "workflow_job": {
            "id": 1, "run_id": 2, "name": "Tests", "labels": ["codebuild-project-1"], "status": "queued"}}
        apply_event(table, payload, {"x-github-event": "workflow_job"}, {"owner/repo": "secret"}, 100)
        self.assertNotIn("job#1", table.items)


if __name__ == "__main__":
    unittest.main()
