-- Schedules used to be generated eight weeks ahead; they now keep only the next
-- occurrence (plus today's, on a meeting day). Drop the surplus left behind by
-- the old horizon so it does not linger in the services list.
--
-- Only schedule-generated occurrences with no attendance go — one-off services
-- and anything already scanned into stay. The next occurrence always falls
-- within a week of today, so eight days leaves it untouched in any timezone.
DELETE FROM "services"
WHERE "schedule_id" IS NOT NULL
  AND "scheduled_at" >= now() + interval '8 days'
  AND NOT EXISTS (
    SELECT 1 FROM "attendance" WHERE "attendance"."service_id" = "services"."id"
  );
