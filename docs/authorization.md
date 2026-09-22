# Authorization framework

Supabase Auth proves a staff member's identity. Application authorization is
database-backed RBAC: every user has one role, and every role has any number of
permissions.

## Data model

- `users.role_id` points to `roles.id`.
- `permissions` is the deployed catalog of allowed module/action keys.
- `role_permissions` grants a permission to a role.
- `Admin`, `Leader`, and `Usher` are built-in roles with stable ids. They keep
  the access that existed before RBAC. Built-in roles cannot be deleted, and
  Admin cannot be edited so the application always has a recovery role.

Permission keys are part of stored data. Treat them like API identifiers: add
new ones, but do not rename or remove them without a data migration.

## Adding authorization to a feature

1. Add the module (when new) and its permission entries to
   `lib/permissions.ts`.
2. Generate a migration, then add the corresponding `permissions` rows. Grant
   every new permission to the protected `admin` role in that migration and
   deliberately choose whether the other built-in roles receive it.
3. Gate every page with `requirePermission("module.action")` before reading
   data.
4. Gate every server action independently with the permission for the exact
   mutation. A hidden button is not a security boundary.
5. Use `hasPermission(user, key)` to conditionally render links and controls.
   Add a sidebar item only when the module has a view permission.
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
