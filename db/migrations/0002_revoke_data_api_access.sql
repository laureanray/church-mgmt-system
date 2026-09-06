--> Keep application data out of Supabase's Data API (PostgREST).
-->
--> The app now ships NEXT_PUBLIC_SUPABASE_ANON_KEY to every browser so that
--> supabase-js can sign people in. That key also authenticates against
--> /rest/v1, and this schema has no RLS policies — so with the default grants
--> anyone holding it could read the whole members directory (names, contact
--> numbers, home addresses) and the staff table straight off the Data API,
--> never passing through requireRole.
-->
--> supabase/config.toml stops exposing `public` locally, but that file does not
--> configure the hosted project, so the guarantee has to live in SQL too.
--> Drizzle connects as the pooler/`postgres` role, which is unaffected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
  END IF;
END
$$;
