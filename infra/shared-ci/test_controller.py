import copy
import unittest

from controller import Controller, choose_job


class FakeAWS:
    def __init__(self, state=None, jobs=None, machine="running"):
        self.data = state or {}
        self.pending = jobs or []
        self.machine = machine
        self.starts = self.stops = self.removed = self.failed_attempts = 0
        self.status = "in_progress"
        self.api_error = False

    def state(self):
        return copy.deepcopy(self.data)

    def patch(self, fields, expected_lease=None, new_lease=False):
        if expected_lease is not None and self.data.get("lease_id") != expected_lease:
            return False
        if new_lease and self.data.get("lease_id"):
            return False
        for key, value in fields.items():
            if value is None:
                self.data.pop(key, None)
            else:
                self.data[key] = value
        return True

    def jobs(self):
        if self.api_error:
            raise RuntimeError("Queue unavailable")
        return self.pending

    def recover_deliveries(self):
        if self.api_error:
            raise RuntimeError("GitHub unavailable")

    def job_status(self, job_id):
        return self.status

    def unclaimed(self, job_id):
        self.failed_attempts += 1

    def finished_locally(self, job_id):
        self.status = "runner_finished"

    def instance_state(self):
        return self.machine

    def start(self):
        self.starts += 1

    def stop(self):
        self.stops += 1

    def remove_runner(self, state):
        self.removed += 1

    def github(self, *args):
        if self.api_error:
            raise RuntimeError("GitHub unavailable")
        return {"runner": {"id": 99}, "encoded_jit_config": "ephemeral-test-config"}


def job(repo="owner/tails", job_id=1):
    return {"repo": repo, "id": job_id, "created_at": "2026-09-21T00:00:00Z",
            "labels": [f"ec2-shared-ci-{job_id}"], "status": "queued"}


def lease():
    return {"lease_id": "lease", "repo": "owner/tails", "job_id": 1,
            "runner_id": 99, "lease_started": 100, "heartbeat": 100, "last_busy": 100}


class ControllerTests(unittest.TestCase):
    def test_wakes_stopped_host_for_work(self):
        aws = FakeAWS(jobs=[job()], machine="stopped")
        Controller(aws, 1000).tick()
        self.assertEqual(aws.starts, 1)
        self.assertEqual(aws.data["last_busy"], 1000)

    def test_waits_for_stopping_host_instead_of_invalid_start(self):
        aws = FakeAWS(jobs=[job()], machine="stopping")
        Controller(aws, 1000).tick()
        self.assertEqual(aws.starts, 0)

    def test_requires_full_idle_window(self):
        aws = FakeAWS({"last_busy": 100})
        Controller(aws, 699).tick()
        self.assertEqual(aws.stops, 0)
        Controller(aws, 700).tick()
        self.assertEqual(aws.stops, 1)

    def test_missing_state_starts_idle_timer_not_shutdown(self):
        aws = FakeAWS()
        Controller(aws, 5000).tick()
        self.assertEqual(aws.stops, 0)
        self.assertEqual(aws.data["last_busy"], 5000)

    def test_queue_resets_idle_timer(self):
        aws = FakeAWS({"last_busy": 100}, [job()])
        Controller(aws, 1000).tick()
        self.assertEqual(aws.stops, 0)
        self.assertEqual(aws.data["last_busy"], 1000)

    def test_active_lease_prevents_stop_with_empty_queue(self):
        aws = FakeAWS(lease())
        Controller(aws, 1000).tick()
        self.assertEqual(aws.stops, 0)

    def test_unknown_queue_or_failed_delivery_recovery_never_means_idle(self):
        aws = FakeAWS({"last_busy": 100})
        aws.api_error = True
        with self.assertRaises(RuntimeError):
            Controller(aws, 1000).tick()
        with self.assertRaises(RuntimeError):
            Controller(aws, 1000).handle({"action": "tick"})
        self.assertEqual(aws.stops, 0)

    def test_finished_job_requests_container_cleanup(self):
        aws = FakeAWS(lease())
        aws.status = "completed"
        Controller(aws, 200).tick()
        self.assertTrue(aws.data["cancel"])
        self.assertEqual(aws.stops, 0)

    def test_second_claim_cannot_allocate_another_runner(self):
        aws = FakeAWS(jobs=[job()])
        first = Controller(aws, 1000).claim()
        self.assertEqual(first["job_id"], 1)
        self.assertEqual(Controller(aws, 1001).claim(), {})
        self.assertNotIn("jit_config", aws.data)

    def test_alternates_repositories_without_reordering_their_jobs(self):
        a, b, c = job(), job("owner/church", 2), job("owner/church", 3)
        self.assertEqual(choose_job([a, c, b], "owner/tails"), b)
        self.assertEqual(choose_job([a, c, b], "owner/church"), a)

    def test_registration_failure_frees_lease(self):
        aws = FakeAWS(jobs=[job()])
        aws.github = lambda *args: (_ for _ in ()).throw(RuntimeError("registration denied"))
        with self.assertRaises(RuntimeError):
            Controller(aws, 1000).claim()
        self.assertNotIn("lease_id", aws.data)

    def test_stale_finish_cannot_release_new_job(self):
        aws = FakeAWS(lease())
        result = Controller(aws, 200).handle({"action": "finish", "lease_id": "old"})
        self.assertTrue(result["cancel"])
        self.assertEqual(aws.data["lease_id"], "lease")

    def test_finish_releases_only_current_lease_and_starts_idle_timer(self):
        aws = FakeAWS(lease())
        Controller(aws, 200).handle({"action": "finish", "lease_id": "lease", "started": True})
        self.assertNotIn("lease_id", aws.data)
        self.assertEqual(aws.data["last_busy"], 200)
        self.assertEqual(aws.data["last_repo"], "owner/tails")

    def test_unclaimed_job_counts_toward_retry_limit(self):
        aws = FakeAWS(lease())
        aws.status = "queued"
        Controller(aws, 200).handle({"action": "finish", "lease_id": "lease", "started": False})
        self.assertEqual(aws.failed_attempts, 1)

    def test_wedged_lease_stops_before_releasing_slot(self):
        aws = FakeAWS(lease())
        Controller(aws, 5000).tick()
        self.assertEqual(aws.stops, 1)
        self.assertIn("lease_id", aws.data)
        self.assertTrue(aws.data["recovering"])
        aws.machine = "stopped"
        Controller(aws, 5060).tick()
        self.assertNotIn("lease_id", aws.data)

    def test_missing_host_heartbeat_recovers_unstarted_job(self):
        aws = FakeAWS(lease())
        aws.status = "queued"
        Controller(aws, 401).tick()
        self.assertEqual(aws.stops, 1)

    def test_failed_boot_cannot_leave_host_billed_indefinitely(self):
        aws = FakeAWS({"waiting_since": 100}, [job()])
        Controller(aws, 1000).tick()
        self.assertEqual(aws.stops, 1)
        self.assertTrue(aws.data["paused"])
        self.assertEqual(Controller(aws, 1001).claim(), {})

    def test_github_recovery_outage_does_not_disable_idle_stop(self):
        aws = FakeAWS({"last_busy": 100})
        aws.recover_deliveries = lambda: (_ for _ in ()).throw(RuntimeError("offline"))
        Controller(aws, 1000).handle({"action": "tick"})
        self.assertEqual(aws.stops, 1)

    def test_started_job_clears_startup_watchdog(self):
        aws = FakeAWS({**lease(), "waiting_since": 50})
        Controller(aws, 200).handle({"action": "heartbeat", "lease_id": "lease", "started": True})
        self.assertNotIn("waiting_since", aws.data)

    def test_completed_job_with_dead_host_does_not_strand_slot_for_80_minutes(self):
        aws = FakeAWS(lease())
        aws.status = "completed"
        Controller(aws, 401).tick()
        self.assertEqual(aws.stops, 1)
        self.assertTrue(aws.data["recovering"])

    def test_cancelled_queue_clears_startup_timer_for_next_burst(self):
        aws = FakeAWS({"waiting_since": 100, "last_busy": 100})
        Controller(aws, 500).tick()
        self.assertNotIn("waiting_since", aws.data)


if __name__ == "__main__":
    unittest.main()
