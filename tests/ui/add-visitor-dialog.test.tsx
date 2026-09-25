import { describe, expect, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as stories from "@/components/scan/add-visitor-dialog.stories";

const { WithPhoto, NameOnly, PhotoRefused } = composeStories(stories);

describe("AddVisitorDialog", () => {
  test("asks to search first, and offers a photo when face check-in is on", async () => {
    render(<WithPhoto />);
    const dialog = await screen.findByRole("dialog", { name: "Add a first-time visitor" });
    expect(dialog).toHaveTextContent("Search by name first");
    expect(within(dialog).getByRole("button", { name: "Take photo" })).toBeDisabled();
  });

  test("offers no photo when face check-in is off", async () => {
    render(<NameOnly />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Take photo" })).toBeNull();
  });

  // Types instantly and allows for a slow CI runner: the story's fake save
  // takes 600ms and the dialog then animates closed.
  test("adds and checks in the visitor, then closes", async () => {
    const user = userEvent.setup({ delay: null });
    render(<NameOnly />);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/First name/), "Joy");
    await user.type(within(dialog).getByLabelText(/Last name/), "Ramos");
    await user.click(within(dialog).getByRole("button", { name: "Add and check in" }));

    expect(await screen.findByText("Last added: Joy Ramos", {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 5000 });
  }, 15_000);

  test("keeps the form open and explains a refused photo", async () => {
    const user = userEvent.setup({ delay: null });
    render(<PhotoRefused />);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/First name/), "Joy");
    await user.type(within(dialog).getByLabelText(/Last name/), "Ramos");
    await user.click(within(dialog).getByRole("button", { name: "Add and check in" }));

    expect(
      (await within(dialog).findAllByText("No face found. Face the camera, in good light.", {}, { timeout: 3000 })).length,
    ).toBeGreaterThan(0);
    expect(within(dialog).getByLabelText(/First name/)).toHaveValue("Joy");
  }, 15_000);
});
