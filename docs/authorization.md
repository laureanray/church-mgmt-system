# Authorization framework

Supabase Auth proves a staff member's identity. Application authorization is
database-backed RBAC: every user has one role, and every role has any number of
permissions. Ministries add to that: a user whose member record serves in a
ministry also receives the ministry's permissions.

## Data model

- `users.role_id` points to `roles.id`.
- `permissions` is the deployed catalog of allowed module/action keys.
- `role_permissions` grants a permission to a role.
- `Admin`, `Leader`, and `Usher` are built-in roles with stable ids. They keep
  the access that existed before RBAC. Built-in roles cannot be deleted, and
  Admin cannot be edited so the application always has a recovery role.

Permission keys are part of stored data. Treat them like API identifiers: add
new ones, but do not rename or remove them without a data migration.

## Delegation limits

Every `users.*`, `roles.*` and `ministries.*` permission can be granted on its
own, and each one changes what some login may do. Without a ceiling, holding
any one of them would mean holding all of them. So **nobody grants, removes or
takes over access they do not hold themselves** (`lib/delegation.ts`), where
"hold" means the actor's effective permissions: role plus ministries.

- **Accounts.** Create, edit, reset-password and delete act only on an account
  whose effective permissions are a subset of the actor's. Creating an account
  hands the actor its temporary password, and editing one can change its login
  email, so either way the actor could sign in as it. The role and linked member
  chosen for an account must stay within the actor's access too. An
  administrator can therefore be edited, reset or removed only by another
  administrator, and the last one cannot remove themselves.
- **Roles and ministries.** Creating or editing a role or a ministry changes
  only the permissions the actor holds. Permissions they do not hold keep their
  saved state: the matrix shows those boxes locked, and the action carries them
  over rather than reading a disabled box's absence as "remove". An edit that
  tries to *add* one is refused outright. Nobody changes the permissions of
  their own role. Reactivating a ministry counts as granting everything it
  grants.
- **Rosters.** Adding your own member record to a roster hands you that
  ministry's grants, so it is held to the same ceiling. Rostering anyone else
  is unaffected, and so is a head managing their own roster.

The pages apply the same rules for usability: the staff list hides actions on
accounts beyond reach and offers only assignable roles, and the edit forms lock
what cannot change. The actions are the boundary.

## Ministries

A ministry (`ministries`) has a roster of **members** (`ministry_members`) and
a set of permissions it grants (`ministry_permissions`). The roster holds
congregation members rather than staff logins, because who serves where is
church data in its own right. Access reaches a login through
`members.user_id`, which the staff user form links:

```
effective permissions = role permissions
                      ∪ grants of every *active* ministry the linked member serves in
```

Ministries only add. Four rules keep that from becoming a route around roles:

- **Role-only modules.** `ROLE_ONLY_MODULES` in `lib/permissions.ts` — staff
  users, roles, ministries, settings, the audit log — can never be granted by a
  ministry. The ministry validator rejects them, and `effectivePermissions`
  ignores any such row that reaches the database some other way.
- **Heads manage their own roster, nothing more.** A roster member with
  position `head` can add and remove members of that ministry without any
  module permission (`canManageRoster`). Only `ministries.update` appoints
  heads or changes a ministry's grants, so a head can decide *who* receives the
  ministry's access but not *what* that access is.
- **Logins stay with `users.*`.** Rostering someone who has no login grants
  nothing. Linking a login to a member record is a `users.update` action, and
  nobody may relink their own login, for the same reason nobody may change
  their own role.
- **Inactive ministries grant nothing**, but keep their roster.

`requireUser()` loads the role's permissions, the linked member and its active
ministries in one round trip (`lib/access.ts`), merges them with
`effectivePermissions`, and exposes `user.ministries` for roster checks. The
staff edit page shows each permission with every role and ministry that grants
it, so "why can this person open Scan?" always has an answer.

A ministry can own a module. LAM is built in (`is_system`, stable id `lam`)
because its roster is exactly who may be scheduled on a service line-up; the
line-up actions enforce that server-side. Built-in ministries cannot be
deleted.

Someone whose role lacks `dashboard.view` — a volunteer whose only access is a
ministry's — is redirected from `/dashboard` to their first accessible module
(`homeFor`), which is where sign-in lands them.

## Adding authorization to a feature

1. Add the module (when new) and its permission entries to
   `lib/permissions.ts`.
2. Generate a migration, then add the corresponding `permissions` rows. Grant
   every new permission to the protected `admin` role in that migration and
   deliberately choose whether the other built-in roles receive it. A module
   that confers control over accounts or authorization belongs in
   `ROLE_ONLY_MODULES`, so no ministry can grant it.
3. Gate every page with `requirePermission("module.action")` before reading
   data.
4. Gate every server action independently with the permission for the exact
   mutation. A hidden button is not a security boundary.
5. Use `hasPermission(user, key)` to conditionally render links and controls.
   Add a navigation entry in `lib/navigation.ts` only when the module has a
   view permission; the sidebar and the post-sign-in redirect both read it.
6. Add coverage for the catalog, the guard, the mutation, and the relevant
   role-management story state.

Prefer separate `view`, `create`, `update`, and `delete` permissions where the
module performs those actions. Domain actions should be explicit, such as
`attendance.record` and `services.sync`, rather than being folded into an
unrelated broad "manage" permission.

## Runtime behavior

`requireUser()` verifies the Supabase token, joins the staff profile to its
role, and loads the role's permission keys. React `cache()` keeps that work to
one evaluation per request. `requirePermission()` reuses the session result and
redirects denied requests to `/no-access`.

The sidebar receives only the role name and permission keys. It filters module
links for usability, while each destination page and action remains responsible
for its own authorization.

## Audit log

`audit.view` (module `audit`) opens `/settings/audit` and the History tab on a
member's page. Migration 0009 grants it to Admin only: the log names who
changed staff accounts and roles, so give it to another role deliberately. A
ministry cannot grant it: `audit` is a role-only module. The
log is append-only from the application's side — no action edits or deletes an
entry; only `bun run audit:prune` removes expired ones.

