import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as stories from "@/components/form/field.stories";

const { Default, Required, WithHint, WithError, FormRow } =
  composeStories(stories);

describe("Field", () => {
  test("associates the label with the control", () => {
    render(<Default />);

    expect(screen.getByLabelText("Full name")).toHaveAttribute(
      "name",
      "fullName",
    );
  });

  // The asterisk is decorative, so it must not leak into the accessible name:
  // "Full name star" is what a screen reader would otherwise announce.
  test("shows a required marker without polluting the accessible name", () => {
    render(<Required />);

    expect(screen.getByText("*")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Full name" }),
    ).toBeInTheDocument();
  });

  test("describes the control with its hint", () => {
    render(<WithHint />);

    expect(screen.getByLabelText("Full name")).toHaveAccessibleDescription(
      "As it appears on their church record.",
    );
  });

  // A server action's field error has to reach the input, not just sit beside
  // it: `aria-invalid` is what draws the red ring, and `role="alert"` is what
  // makes a screen reader announce the failure.
  test("wires an error onto the control it belongs to", () => {
    render(<WithError />);

    const input = screen.getByLabelText("Full name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Full name is required.");
    expect(screen.getByRole("alert")).toHaveTextContent("Full name is required.");
  });

  test("shows the error in place of the hint, not below it", () => {
    render(<WithError />);

    expect(
      screen.queryByText("As it appears on their church record."),
    ).toBeNull();
  });

  test("leaves a valid field unmarked", () => {
    render(<WithHint />);

    expect(screen.getByLabelText("Full name")).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  test("keeps every control in a form row labelled", () => {
    render(<FormRow />);

    for (const label of ["Full name", "Contact number", "Occupation"]) {
      expect(screen.getByRole("textbox", { name: label })).toBeInTheDocument();
    }
    // A date input has no implicit ARIA role, so it is matched by its label.
    expect(screen.getByLabelText("Birthdate")).toBeInTheDocument();
  });
});
