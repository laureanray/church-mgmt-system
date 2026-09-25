-- Consent becomes a condition of enrolment (#21). A face enrolled before this
-- migration has no consent on record, so it cannot stay: 0011 and this
-- migration ship together, so production has no such rows, and in development
-- they are test enrolments. Their faces stay in the development group until
-- Settings -> Purge all face data (or `bun run face:setup` on a new group).
DELETE FROM "member_faces";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "face_consent_notice" text;--> statement-breakpoint
ALTER TABLE "member_faces" ADD COLUMN "consent_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "member_faces" ADD COLUMN "consent_recorded_by" text;--> statement-breakpoint
ALTER TABLE "member_faces" ADD COLUMN "consent_notice" text NOT NULL;--> statement-breakpoint
ALTER TABLE "member_faces" ADD CONSTRAINT "member_faces_consent_recorded_by_users_id_fk" FOREIGN KEY ("consent_recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;