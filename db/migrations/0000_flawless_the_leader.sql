CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`sheets_webhook_url` text,
	`sheets_webhook_secret` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`service_id` text NOT NULL,
	`checked_in_at` integer DEFAULT (unixepoch()) NOT NULL,
	`recorded_by` text,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_member_service_unique` ON `attendance` (`member_id`,`service_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`qr_token` text NOT NULL,
	`full_name` text NOT NULL,
	`birthdate` text,
	`spiritual_birthday` text,
	`member_since_year` integer,
	`gender` text,
	`marital_status` text,
	`spouse_name` text,
	`wedding_anniversary` text,
	`contact_number` text,
	`home_address` text,
	`mother_name` text,
	`father_name` text,
	`educational_level` text,
	`occupation` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_qr_token_unique` ON `members` (`qr_token`);--> statement-breakpoint
CREATE TABLE `service_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'sunday_service' NOT NULL,
	`day_of_week` integer NOT NULL,
	`time_of_day` text NOT NULL,
	`location` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'sunday_service' NOT NULL,
	`scheduled_at` integer NOT NULL,
	`location` text,
	`notes` text,
	`schedule_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `service_schedules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_schedule_occurrence_unique` ON `services` (`schedule_id`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'usher' NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);