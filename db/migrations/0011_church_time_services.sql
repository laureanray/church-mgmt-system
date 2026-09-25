-- Services used to be scheduled in the server's timezone rather than the
-- church's. On Vercel that is UTC, so every service written there sits eight
-- hours late: a "Sunday 09:00" schedule produced 09:00 UTC, which is 5 PM in
-- Manila, and a one-off service typed as 9:00 AM was stored the same way.
-- Server-rendered pages hid it by also formatting in UTC. The application now
-- reads and writes church time (lib/church-time.ts); this moves existing rows
-- to match, so each service keeps the time the services list has been showing.
--
-- Whether a database was written in UTC is read from its own data rather than
-- assumed: each schedule-generated occurrence matches its schedule's time of
-- day either when read as UTC or when read as Manila time. A database written
-- on a machine already in Manila, such as a developer's, is left alone. A
-- database with no generated occurrences gives no evidence either way and is
-- also left alone; its one-off services, if any, need checking by hand.
--
-- Every service moves by the same amount, one-off services included, so the
-- order of services and each (schedule_id, scheduled_at) pair are preserved.
-- The move goes via a time about eleven years out, so that no row passes
-- through a slot another row still holds: the unique constraint is checked row
-- by row. Both steps are in hours, which are absolute, where years and months
-- would be calendar arithmetic in the session's zone.
DO $$
DECLARE
  written_in_utc integer;
  written_in_manila integer;
BEGIN
  SELECT
    count(*) FILTER (
      WHERE to_char(s.scheduled_at AT TIME ZONE 'UTC', 'HH24:MI') = sc.time_of_day
    ),
    count(*) FILTER (
      WHERE to_char(s.scheduled_at AT TIME ZONE 'Asia/Manila', 'HH24:MI') = sc.time_of_day
    )
  INTO written_in_utc, written_in_manila
  FROM "services" s
  JOIN "service_schedules" sc ON sc.id = s.schedule_id;

  IF written_in_utc > written_in_manila THEN
    UPDATE "services" SET "scheduled_at" = "scheduled_at" + interval '100000 hours';
    UPDATE "services" SET "scheduled_at" = "scheduled_at" - interval '100008 hours';
    RAISE NOTICE 'Moved every service 8 hours earlier: % of % generated occurrences were written in UTC.',
      written_in_utc, written_in_utc + written_in_manila;
  ELSE
    RAISE NOTICE 'Services left as they are: % generated occurrences were written in UTC, % in Manila time.',
      written_in_utc, written_in_manila;
  END IF;
END $$;
