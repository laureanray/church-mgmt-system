import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as ministryFormStories from "@/components/ministries/ministry-form.stories";
import * as matrixStories from "@/components/roles/permission-matrix.stories";
import * as roleFormStories from "@/components/roles/role-form.stories";

/*
 * Nobody grants or removes a permission they do not hold (lib/delegation.ts).
 * The server enforces it; these check the forms show it, and that a locked box
 * is left out of the submission rather than sent as a change.
 */

function checkbox(name: RegExp) {
  return screen.getByRole("checkbox", { name }) as HTMLInputElement;
}

describe("PermissionMatrix with a limited editor", () => {
  const { Default, LimitedEditor } = composeStories(matrixStories);

  test("locks what the editor lacks, in its saved state", () => {
    render(<LimitedEditor />);

    expect(checkbox(/Create members/)).toBeEnabled();
    expect(checkbox(/Delete members/)).toBeDisabled();
    expect(checkbox(/Delete members/)).toBeChecked();
    expect(checkbox(/Delete staff users/)).toBeDisabled();
    expect(checkbox(/Delete staff users/)).not.toBeChecked();
  });

  test("locks nothing when no limit is given", () => {
    render(<Default />);
    expect(screen.getAllByRole("checkbox").every((box) => !(box as HTMLInputElement).disabled)).toBe(true);
  });
});

describe("RoleForm with a limited editor", () => {
  const { LimitedEditor, OwnRole } = composeStories(roleFormStories);

  test("submits only the permissions the editor may change", () => {
    render(<LimitedEditor />);
    expect(
      screen.getByText(/Permissions you do not hold yourself are locked/),
    ).toBeInTheDocument();

    fireEvent.click(checkbox(/Create members/));
    const form = checkbox(/Create members/).form!;
    // Services' View is saved on the role but locked, so it is not submitted —
    // updateRole carries it over from the saved role instead.
    expect(new FormData(form).getAll("permissions")).toEqual([
      "dashboard.view",
      "attendance.view",
      "attendance.record",
      "members.create",
    ]);
    expect(checkbox(/View services/)).toBeChecked();
    expect(checkbox(/View services/)).toBeDisabled();
  });

  test("locks every permission of your own role but not its name", () => {
    render(<OwnRole />);
    expect(screen.getByText(/This is your own role/)).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").every((box) => (box as HTMLInputElement).disabled)).toBe(true);
    expect(screen.getByRole("textbox", { name: /Role Name/ })).toBeEnabled();
  });
});

describe("MinistryForm with a limited editor", () => {
  const { LimitedEditor } = composeStories(ministryFormStories);

  test("keeps a grant the editor cannot give, locked", () => {
    render(<LimitedEditor />);
    expect(checkbox(/Plan line-ups/)).toBeChecked();
    expect(checkbox(/Plan line-ups/)).toBeDisabled();
    expect(checkbox(/View LAM/)).toBeEnabled();
  });
});
