import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as accessSummaryStories from "@/components/ministries/access-summary.stories";
import * as addRosterStories from "@/components/ministries/add-roster-member-form.stories";
import * as ministryFormStories from "@/components/ministries/ministry-form.stories";
import * as rosterActionStories from "@/components/ministries/roster-row-actions.stories";
import * as matrixStories from "@/components/roles/permission-matrix.stories";

describe("PermissionMatrix", () => {
  const { Default, MinistryScope } = composeStories(matrixStories);

  test("offers every module to a role", () => {
    render(<Default />);
    expect(screen.getByRole("group", { name: "Staff Users" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Roles & Permissions" })).toBeInTheDocument();
  });

  test("offers a ministry only what it may grant", () => {
    render(<MinistryScope />);
    for (const roleOnly of ["Staff Users", "Roles & Permissions", "Ministries", "Settings", "Audit Log"]) {
      expect(screen.queryByRole("group", { name: roleOnly })).toBeNull();
    }
    expect(screen.getByRole("group", { name: "LAM" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Plan line-ups/ })).toBeChecked();
  });
});

describe("MinistryForm", () => {
  const { Create, Inactive, DuplicateName } = composeStories(ministryFormStories);

  test("submits the active switch and grants as ordinary form fields", () => {
    render(<Create />);
    const name = screen.getByRole("textbox", { name: /Ministry Name/ }) as HTMLInputElement;
    fireEvent.click(screen.getByRole("checkbox", { name: /View LAM/ }));
    const data = new FormData(name.form!);
    expect(data.get("active")).toBe("on");
    expect(data.getAll("permissions")).toEqual(["lam.view"]);
  });

  test("an inactive ministry submits no active value", () => {
    render(<Inactive />);
    const name = screen.getByRole("textbox", { name: /Ministry Name/ }) as HTMLInputElement;
    expect(screen.getByRole("switch", { name: "Active" })).not.toBeChecked();
    expect(new FormData(name.form!).get("active")).toBeNull();
  });

  test("shows a server error on the name", async () => {
    render(<DuplicateName />);
    const name = screen.getByRole("textbox", { name: /Ministry Name/ }) as HTMLInputElement;
    fireEvent.submit(name.form!);
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
    expect(name).toHaveAccessibleDescription("That ministry name is already in use.");
  });
});

describe("roster", () => {
  const { Default, EveryoneAdded } = composeStories(addRosterStories);
  const { Administrator, MinistryHead, ReadOnly } = composeStories(rosterActionStories);

  test("the add form names its member picker", () => {
    render(<Default />);
    expect(screen.getByRole("combobox", { name: "Add to roster" })).toBeInTheDocument();
  });

  test("says so when there is no one left to add", () => {
    render(<EveryoneAdded />);
    expect(screen.getByText("Every member is already on this roster.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  test("administrators can appoint heads and remove", () => {
    render(<Administrator />);
    expect(screen.getByRole("button", { name: "Make head" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Maria Santos from the roster" }),
    ).toBeInTheDocument();
  });

  test("heads can remove but not appoint; members see nothing", () => {
    const { unmount } = render(<MinistryHead />);
    expect(screen.queryByRole("button", { name: "Make head" })).toBeNull();
    expect(screen.getByRole("button", { name: /Remove Maria Santos/ })).toBeInTheDocument();
    unmount();
    render(<ReadOnly />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("AccessSummary", () => {
  const { WithSources, Empty } = composeStories(accessSummaryStories);

  test("credits a permission to both its role and its ministry", () => {
    render(<WithSources />);
    const item = screen.getByText("View services").closest("li")!;
    expect(within(item).getByText("Role: Usher")).toBeInTheDocument();
    expect(within(item).getByText("LAM")).toBeInTheDocument();
  });

  test("groups under module headings", () => {
    render(<WithSources />);
    expect(screen.getByText("Dashboard").tagName).toBe("DT");
    expect(screen.getAllByText("LAM").some((node) => node.tagName === "DT")).toBe(true);
  });

  test("renders its empty state", () => {
    render(<Empty />);
    expect(screen.getByText("Grants no access")).toBeInTheDocument();
  });
});
