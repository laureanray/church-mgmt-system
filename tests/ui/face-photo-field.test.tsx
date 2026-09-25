import { describe, expect, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as stories from "@/components/members/face-photo-field.stories";

const { Default, Named, PhotoRefused, ConsentMissing } = composeStories(stories);

describe("FacePhotoField", () => {
  test("is optional, and holds the camera until consent is ticked", async () => {
    const user = userEvent.setup();
    render(<Default />);
    expect(screen.getByText(/Optional. Without a photo they check in by name/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /They have read this notice/ }));
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeEnabled();
  });

  test("names the member when the form knows them", () => {
    render(<Named />);
    expect(
      screen.getByRole("checkbox", { name: /Ana Santos has read this notice.*and agrees/ }),
    ).toBeInTheDocument();
  });

  test("submits the tick with the form", async () => {
    const user = userEvent.setup();
    const { container } = render(<Default />);
    await user.click(screen.getByRole("checkbox"));
    const form = container.querySelector("form")!;
    expect(new FormData(form).get("faceConsent")).toBe("yes");
  });

  test("explains a refused photo", () => {
    render(<PhotoRefused />);
    expect(screen.getByRole("alert")).toHaveTextContent("too dark, blurred or turned away");
  });

  test("marks the consent box when the server found none", () => {
    render(<ConsentMissing />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Record their consent/)).toBeInTheDocument();
  });
});
