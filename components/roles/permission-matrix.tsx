import {
  MINISTRY_GRANTABLE_PERMISSIONS,
  PERMISSIONS,
  groupPermissionsByModule,
  type PermissionKey,
} from "@/lib/permissions";

/**
 * A grouped, native-checkbox editor for a role's or a ministry's permission
 * assignments. `scope="ministry"` offers only what a ministry may grant — the
 * server validator enforces the same subset, so this is presentation only.
 *
 * `grantable` locks every other checkbox in its current state: nobody grants
 * or removes a permission they do not hold (lib/delegation.ts). A locked box
 * is never submitted, and the action keeps its saved state, so this too is
 * presentation — the server applies the same rule. Omit it when the editor
 * holds everything.
 */
export function PermissionMatrix({
  selected = [],
  disabled = false,
  scope = "role",
  grantable,
}: {
  selected?: readonly PermissionKey[];
  disabled?: boolean;
  scope?: "role" | "ministry";
  grantable?: readonly PermissionKey[];
}) {
  const selectedKeys = new Set(selected);
  const grantableKeys = grantable ? new Set(grantable) : null;
  const locked = (key: PermissionKey) =>
    disabled || (grantableKeys !== null && !grantableKeys.has(key));
  const modules = groupPermissionsByModule(
    scope === "ministry" ? MINISTRY_GRANTABLE_PERMISSIONS : PERMISSIONS,
  );

  return (
    <div className="divide-y rounded-md border">
      {modules.map((module) => (
        <fieldset
          key={module.key}
          className="grid gap-4 p-4 md:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)]"
        >
          <legend className="sr-only">{module.label}</legend>
          <div>
            <h3 className="text-sm font-medium">{module.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {module.description}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {module.permissions.map((permission) => (
              <label
                key={permission.key}
                className="flex items-start gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="permissions"
                  value={permission.key}
                  defaultChecked={selectedKeys.has(permission.key)}
                  disabled={locked(permission.key)}
                  className="mt-0.5 size-4 rounded-sm border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>
                  <span className="block font-medium leading-5">
                    {permission.label}
                  </span>
                  <span className="block text-xs leading-4 text-muted-foreground">
                    {permission.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
