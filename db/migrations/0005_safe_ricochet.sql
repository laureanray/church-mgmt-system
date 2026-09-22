CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
INSERT INTO "roles" ("id", "name", "description", "is_system") VALUES
	('admin', 'Admin', 'Full access to every module and permission.', true),
	('leader', 'Leader', 'Manages members, cell groups, services, and attendance.', true),
	('usher', 'Usher', 'Views church records and records service attendance.', true);
--> statement-breakpoint
INSERT INTO "permissions" ("key", "module", "action", "label", "description", "sort_order") VALUES
	('dashboard.view', 'dashboard', 'view', 'View dashboard', 'Open the dashboard and see its summaries.', 10),
	('attendance.view', 'attendance', 'view', 'View check-in', 'Open the attendance check-in module.', 20),
	('attendance.record', 'attendance', 'record', 'Record attendance', 'Check a member into a service.', 21),
	('members.view', 'members', 'view', 'View members', 'Browse and open member records.', 30),
	('members.create', 'members', 'create', 'Create members', 'Add member records.', 31),
	('members.update', 'members', 'update', 'Edit members', 'Change member records.', 32),
	('members.delete', 'members', 'delete', 'Delete members', 'Permanently remove member records.', 33),
	('cell_groups.view', 'cell_groups', 'view', 'View cell groups', 'Browse the cell-group network.', 40),
	('cell_groups.create', 'cell_groups', 'create', 'Create cell groups', 'Add cell groups.', 41),
	('cell_groups.update', 'cell_groups', 'update', 'Edit cell groups', 'Change groups and member assignments.', 42),
	('cell_groups.delete', 'cell_groups', 'delete', 'Delete cell groups', 'Permanently remove cell groups.', 43),
	('services.view', 'services', 'view', 'View services', 'Browse services, schedules, and attendance.', 50),
	('services.create', 'services', 'create', 'Create services', 'Add services and recurring schedules.', 51),
	('services.update', 'services', 'update', 'Edit services', 'Change services and recurring schedules.', 52),
	('services.delete', 'services', 'delete', 'Delete services', 'Permanently remove services and schedules.', 53),
	('services.sync', 'services', 'sync', 'Sync attendance', 'Send attendance records to the configured integration.', 54),
	('users.view', 'users', 'view', 'View staff users', 'Browse staff accounts.', 60),
	('users.create', 'users', 'create', 'Create staff users', 'Create staff login accounts.', 61),
	('users.update', 'users', 'update', 'Edit staff users', 'Change staff profiles and assigned roles.', 62),
	('users.reset_password', 'users', 'reset_password', 'Reset passwords', 'Issue temporary passwords to staff.', 63),
	('users.delete', 'users', 'delete', 'Delete staff users', 'Permanently remove staff accounts.', 64),
	('roles.view', 'roles', 'view', 'View roles', 'Browse roles and their permissions.', 70),
	('roles.create', 'roles', 'create', 'Create roles', 'Add custom staff roles.', 71),
	('roles.update', 'roles', 'update', 'Edit roles', 'Change role details and permissions.', 72),
	('roles.delete', 'roles', 'delete', 'Delete roles', 'Delete unused custom roles.', 73),
	('settings.view', 'settings', 'view', 'View settings', 'Open application settings.', 80),
	('settings.update', 'settings', 'update', 'Update settings', 'Change application and integration settings.', 81);
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT 'admin', "key" FROM "permissions";
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key") VALUES
	('leader', 'dashboard.view'),
	('leader', 'attendance.view'),
	('leader', 'attendance.record'),
	('leader', 'members.view'),
	('leader', 'members.create'),
	('leader', 'members.update'),
	('leader', 'members.delete'),
	('leader', 'cell_groups.view'),
	('leader', 'cell_groups.create'),
	('leader', 'cell_groups.update'),
	('leader', 'cell_groups.delete'),
	('leader', 'services.view'),
	('leader', 'services.create'),
	('leader', 'services.update'),
	('leader', 'services.delete'),
	('leader', 'services.sync'),
	('usher', 'dashboard.view'),
	('usher', 'attendance.view'),
	('usher', 'attendance.record'),
	('usher', 'members.view'),
	('usher', 'cell_groups.view'),
	('usher', 'services.view');
--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "role" TO "role_id";--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;
