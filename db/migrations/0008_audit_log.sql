CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"summary" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
INSERT INTO "permissions" ("key", "module", "action", "label", "description", "sort_order") VALUES
	('audit.view', 'audit', 'view', 'View audit log', 'Read the audit log and each member''s change history.', 90)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- The log names who changed what, including staff accounts and roles, so only
-- the protected Admin role reads it until someone grants it deliberately.
INSERT INTO "role_permissions" ("role_id", "permission_key") VALUES
	('admin', 'audit.view')
ON CONFLICT DO NOTHING;
