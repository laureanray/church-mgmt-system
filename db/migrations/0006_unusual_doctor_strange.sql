CREATE INDEX "role_permissions_permission_key_idx" ON "role_permissions" USING btree ("permission_key");--> statement-breakpoint
CREATE INDEX "users_role_id_idx" ON "users" USING btree ("role_id");