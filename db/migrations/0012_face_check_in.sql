CREATE TABLE "member_faces" (
	"member_id" text PRIMARY KEY NOT NULL,
	"photo" "bytea" NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrolled_by" text,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_recorded_by" text,
	"consent_notice" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "face_consent_notice" text;--> statement-breakpoint
ALTER TABLE "member_faces" ADD CONSTRAINT "member_faces_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_faces" ADD CONSTRAINT "member_faces_enrolled_by_users_id_fk" FOREIGN KEY ("enrolled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_faces" ADD CONSTRAINT "member_faces_consent_recorded_by_users_id_fk" FOREIGN KEY ("consent_recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;