CREATE TABLE "service_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "service_type" DEFAULT 'worship_service' NOT NULL,
	"day_of_week" integer NOT NULL,
	"time_of_day" text NOT NULL,
	"location" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_schedule_id_service_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."service_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_schedule_occurrence_unique" UNIQUE("schedule_id","scheduled_at");