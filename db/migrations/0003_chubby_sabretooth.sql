CREATE INDEX "attendance_service_id_idx" ON "attendance" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "attendance_checked_in_at_idx" ON "attendance" USING btree ("checked_in_at");--> statement-breakpoint
CREATE INDEX "attendance_recorded_by_idx" ON "attendance" USING btree ("recorded_by");--> statement-breakpoint
CREATE INDEX "cell_groups_leader_id_idx" ON "cell_groups" USING btree ("leader_id");--> statement-breakpoint
CREATE INDEX "cell_groups_parent_cell_group_id_idx" ON "cell_groups" USING btree ("parent_cell_group_id");--> statement-breakpoint
CREATE INDEX "members_full_name_idx" ON "members" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "members_cell_group_id_idx" ON "members" USING btree ("cell_group_id");--> statement-breakpoint
CREATE INDEX "services_scheduled_at_idx" ON "services" USING btree ("scheduled_at");