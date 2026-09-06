--> Supabase Auth replaces Auth.js as the identity provider.
--> Credentials now live in auth.users; this table keeps only profile data,
--> and its id must equal the Supabase auth user id.
-->
--> Every pre-existing row was created by Auth.js: its id has no auth.users
--> counterpart and its password_hash is about to be dropped, so the account
--> cannot authenticate after this migration no matter what we keep. Some also
--> predate the email column being required. Delete them rather than leave
--> unusable logins behind. members.user_id and attendance.recorded_by are
--> ON DELETE SET NULL, so member and attendance history is preserved.
-->
--> This empties the staff table, and /users needs an admin to sign in, so the
--> database is left with no way in. Recreate the first account immediately
--> after deploying with:
-->
-->   ADMIN_EMAIL=… ADMIN_PASSWORD=… pnpm bootstrap:admin
-->
--> (or, locally, `pnpm db:seed`). Everyone else is added through /users after
--> that. The script is deliberately separate from the build: creating an admin
--> automatically would mean shipping a default credential.
DELETE FROM "users";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "username";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";
