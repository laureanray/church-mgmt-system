import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as changeStories from "@/components/audit/audit-changes.stories";
import * as tableStories from "@/components/audit/audit-log-table.stories";
import * as tabStories from "@/components/patterns/link-tabs.stories";

const { SingleFieldEdit, RedactedSecret, Created, NoFields } =
  composeStories(changeStories);
const { FullLog, RecordHistory, NoMatches, Empty } = composeStories(tableStories);
const { Default: Tabs, SecondActive } = composeStories(tabStories);

describe("AuditChanges", () => {
  test("shows an edit as the old value struck and the new one inserted", () => {
    const { container } = render(<SingleFieldEdit />);
    expect(screen.getByText("Contact number:")).toBeInTheDocument();
    expect(container.querySelector("del")).toHaveTextContent("+63 917 555 0134");
    expect(container.querySelector("ins")).toHaveTextContent("+63 918 555 0177");
  });

  test("shows a redacted secret as the marker, never a value", () => {
    render(<RedactedSecret />);
    expect(screen.getAllByText("[redacted]")).toHaveLength(2);
  });

  test("folds a whole record behind a disclosure, leaving out empty fields", () => {
    const { container } = render(<Created />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(screen.getByText("New record · 6 fields")).toBeInTheDocument();
    expect(screen.queryByText("Spouse name")).toBeNull();
  });

  test("renders a dash for an entry with no fields", () => {
    render(<NoFields />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("AuditLogTable", () => {
  test("the full log is searchable and names a deleted author", () => {
    render(<FullLog />);
    expect(screen.getByRole("textbox", { name: "Search the audit log" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(screen.getByText("Deleted user")).toBeInTheDocument();
  });

  test("a record's history drops the search and the record column", () => {
    render(<RecordHistory />);
    expect(screen.queryByRole("textbox")).toBeNull();
    const headers = screen.getAllByRole("columnheader").map((c) => c.textContent);
    expect(headers.join(" ")).not.toContain("Record");
  });

  test("an empty log and a missed search read differently", () => {
    const { unmount } = render(<Empty />);
    expect(screen.getByText("Nothing logged yet")).toBeInTheDocument();
    unmount();
    render(<NoMatches />);
    expect(screen.getByText("No entries match")).toBeInTheDocument();
  });
});

describe("LinkTabs", () => {
  test("marks only the current tab, as a link", () => {
    render(<Tabs />);
    const nav = screen.getByRole("navigation", { name: "Member record" });
    const links = nav.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
  });

  test("moves the selection with the URL", () => {
    render(<SecondActive />);
    expect(screen.getByRole("link", { name: /History/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
