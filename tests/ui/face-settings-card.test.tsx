import { describe, expect, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as stories from "@/components/settings/face-settings-card.stories";

const { Default, ReadOnly, NobodyEnrolled, PurgeFails, NotConfigured } =
  composeStories(stories);

describe("FaceSettingsCard", () => {
  test("says how many are enrolled and links the privacy write-up", () => {
    render(<Default />);
    expect(screen.getByText(/42 members are enrolled/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /How face data is kept and deleted/ }),
    ).toHaveAttribute("href", expect.stringContaining("docs/privacy.md"));
    expect(
      (screen.getByLabelText("Consent notice") as HTMLTextAreaElement).value,
    ).toContain("Data Privacy Act");
  });

  test("explains a notice too short to save", async () => {
    const user = userEvent.setup();
    render(<Default />);
    const notice = screen.getByLabelText("Consent notice");
    await user.clear(notice);
    await user.type(notice, "OK?");
    await user.click(screen.getByRole("button", { name: "Save notice" }));
    expect(await screen.findByText(/Write out the notice in full/)).toBeInTheDocument();
  }, 15_000);

  test("purges only once the phrase is typed", async () => {
    const user = userEvent.setup();
    render(<Default />);
    await user.click(screen.getByRole("button", { name: "Purge all face data" }));
    const dialog = await screen.findByRole("dialog", { name: "Purge all face data?" });
    const purge = within(dialog).getByRole("button", { name: "Purge" });
    expect(purge).toBeDisabled();

    await user.type(within(dialog).getByRole("textbox"), "delete all face data");
    expect(purge).toBeEnabled();
    await user.click(purge);
    expect(
      await screen.findByText(/No members are enrolled yet/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  }, 15_000);

  test("keeps the dialog open and explains a failed purge", async () => {
    const user = userEvent.setup();
    render(<PurgeFails />);
    await user.click(screen.getByRole("button", { name: "Purge all face data" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "delete all face data");
    await user.click(within(dialog).getByRole("button", { name: "Purge" }));
    expect(
      await within(dialog).findByText(/Face recognition is busy/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  }, 15_000);

  test("offers nothing to change to staff who cannot update settings", () => {
    render(<ReadOnly />);
    expect(screen.getByLabelText("Consent notice")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("has nothing to purge with nobody enrolled", () => {
    render(<NobodyEnrolled />);
    expect(screen.getByRole("button", { name: "Purge all face data" })).toBeDisabled();
  });

  test("says when face check-in is off, and offers no purge", () => {
    render(<NotConfigured />);
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Purge all face data" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save notice" })).toBeInTheDocument();
  });
});
