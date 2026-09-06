-- Supabase's own Postgres image ships with this schema already present;
-- stock postgres:17-alpine does not, and GoTrue's first migration assumes it
-- exists rather than creating it. Runs once, on a fresh data directory.
CREATE SCHEMA IF NOT EXISTS auth;
