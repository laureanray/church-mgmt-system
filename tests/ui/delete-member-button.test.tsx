import { describe, expect, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as stories from "@/components/members/delete-member-button.stories";

const { FaceNotRemoved } = composeStories(stories);

describe("DeleteMemberButton", () => {
  test("warns that the face goes too", async () => {
    const user = userEvent.setup();
    render(<FaceNotRemoved />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("dialog", { name: "Delete member?" })).toHaveTextContent(
      "their face for check-in",
    );
  });

  test("explains a deletion refused because the face could not be removed", async () => {
    const user = userEvent.setup();
    render(<FaceNotRemoved />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete member" }));
    expect(
      await within(dialog).findByRole("alert", {}, { timeout: 3000 }),
    ).toHaveTextContent("the member was not deleted");
  });
});
