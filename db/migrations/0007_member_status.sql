ALTER TABLE "members" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
CREATE INDEX "members_status_idx" ON "members" USING btree ("status");