CREATE TABLE `cell_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`leader_id` text,
	`parent_cell_group_id` text,
	`meeting_day` integer,
	`meeting_time` text,
	`meeting_location` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`leader_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_cell_group_id`) REFERENCES `cell_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `members` ADD `cell_group_id` text REFERENCES cell_groups(id);--> statement-breakpoint
ALTER TABLE `members` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_id_unique` ON `members` (`user_id`);