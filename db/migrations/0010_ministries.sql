CREATE TABLE "lineup_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"member_id" text NOT NULL,
	"part" text NOT NULL,
	CONSTRAINT "lineup_assignments_service_member_part_unique" UNIQUE("service_id","member_id","part")
);
--> statement-breakpoint
CREATE TABLE "lineup_songs" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"song_id" text NOT NULL,
	"position" integer NOT NULL,
	"song_key" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "ministries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ministries_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ministry_members" (
	"ministry_id" text NOT NULL,
	"member_id" text NOT NULL,
	"position" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ministry_members_ministry_id_member_id_pk" PRIMARY KEY("ministry_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "ministry_permissions" (
	"ministry_id" text NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "ministry_permissions_ministry_id_permission_key_pk" PRIMARY KEY("ministry_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"default_key" text,
	"tempo" integer,
	"reference_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lineup_assignments" ADD CONSTRAINT "lineup_assignments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_assignments" ADD CONSTRAINT "lineup_assignments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_songs" ADD CONSTRAINT "lineup_songs_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_songs" ADD CONSTRAINT "lineup_songs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_members" ADD CONSTRAINT "ministry_members_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_members" ADD CONSTRAINT "ministry_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_permissions" ADD CONSTRAINT "ministry_permissions_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_permissions" ADD CONSTRAINT "ministry_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lineup_assignments_member_id_idx" ON "lineup_assignments" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "lineup_songs_service_id_idx" ON "lineup_songs" USING btree ("service_id","position");--> statement-breakpoint
CREATE INDEX "lineup_songs_song_id_idx" ON "lineup_songs" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "ministry_members_member_id_idx" ON "ministry_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "ministry_permissions_permission_key_idx" ON "ministry_permissions" USING btree ("permission_key");--> statement-breakpoint
CREATE INDEX "songs_title_idx" ON "songs" USING btree ("title");--> statement-breakpoint
INSERT INTO "permissions" ("key", "module", "action", "label", "description", "sort_order") VALUES
	('ministries.view', 'ministries', 'view', 'View ministries', 'Browse every ministry and its roster.', 90),
	('ministries.create', 'ministries', 'create', 'Create ministries', 'Add ministries.', 91),
	('ministries.update', 'ministries', 'update', 'Edit ministries', 'Change ministries, their access, rosters, and heads.', 92),
	('ministries.delete', 'ministries', 'delete', 'Delete ministries', 'Permanently remove ministries.', 93),
	('lam.view', 'lam', 'view', 'View LAM', 'Browse the song library and service line-ups.', 100),
	('lam.songs_create', 'lam', 'songs_create', 'Add songs', 'Add songs to the library.', 101),
	('lam.songs_update', 'lam', 'songs_update', 'Edit songs', 'Change songs in the library.', 102),
	('lam.songs_delete', 'lam', 'songs_delete', 'Delete songs', 'Remove songs no line-up uses.', 103),
	('lam.lineups_update', 'lam', 'lineups_update', 'Plan line-ups', 'Choose a service''s songs and who serves.', 104);
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key") VALUES
	('admin', 'ministries.view'),
	('admin', 'ministries.create'),
	('admin', 'ministries.update'),
	('admin', 'ministries.delete'),
	('admin', 'lam.view'),
	('admin', 'lam.songs_create'),
	('admin', 'lam.songs_update'),
	('admin', 'lam.songs_delete'),
	('admin', 'lam.lineups_update'),
	('leader', 'ministries.view'),
	('leader', 'lam.view');
--> statement-breakpoint
--> Starter ministries. Only LAM is built in: its roster is who can be put on a
--> line-up, so the module depends on its id. The others are ordinary rows an
--> administrator may rename, re-grant, or delete.
INSERT INTO "ministries" ("id", "name", "description", "is_system") VALUES
	('lam', 'LAM', 'Liturgy, Arts, and Music: worship, music, and the arts in every service.', true),
	('ushering', 'Ushering', 'Welcomes people and records attendance at every service.', false),
	('childrens-ministry', 'Children''s Ministry', 'Teaches and cares for children during services.', false);
--> statement-breakpoint
INSERT INTO "ministry_permissions" ("ministry_id", "permission_key") VALUES
	('lam', 'services.view'),
	('lam', 'lam.view'),
	('lam', 'lam.songs_create'),
	('lam', 'lam.songs_update'),
	('lam', 'lam.lineups_update'),
	('ushering', 'services.view'),
	('ushering', 'attendance.view'),
	('ushering', 'attendance.record');
