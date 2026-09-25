import { describe, expect, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as stories from "@/components/scan/scanner-panel.stories";

const { NoServiceSelected } = composeStories(stories);

describe("ScannerPanel", () => {
  test("offers name search even before the camera can start", async () => {
    render(<NoServiceSelected />);

    expect(
      screen.getByRole("combobox", { name: "Check in by name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a service to start the camera."),
    ).toBeInTheDocument();
  });

  test("a name picked before choosing a service is refused, and kept", async () => {
    const user = userEvent.setup();
    render(<NoServiceSelected />);

    const box = screen.getByRole("combobox", { name: "Check in by name" });
    await user.type(box, "ruth");
    await user.click(await screen.findByRole("option", { name: /Ruth Villanueva/ }));

    expect(await screen.findByText("Select a service first")).toBeInTheDocument();
    expect(box).toHaveValue("ruth");
  });
});
