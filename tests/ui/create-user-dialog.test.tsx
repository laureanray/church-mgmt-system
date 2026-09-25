import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as stories from "@/components/users/create-user-dialog.stories";

describe("CreateUserDialog", () => {
  const { Default, WithoutMemberLinking } = composeStories(stories);

  test("offers a member record to link", async () => {
    render(<Default />);
    fireEvent.click(screen.getByRole("button", { name: /Add Staff/ }));
    expect(await screen.findByText("Member Record")).toBeInTheDocument();
  });

  test("leaves linking out for a viewer who cannot edit users", async () => {
    render(<WithoutMemberLinking />);
    fireEvent.click(screen.getByRole("button", { name: /Add Staff/ }));
    expect(await screen.findByRole("textbox", { name: /Email/ })).toBeInTheDocument();
    expect(screen.queryByText("Member Record")).toBeNull();
  });
});
