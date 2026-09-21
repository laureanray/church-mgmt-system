import { expect, test } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { composeStories } from "@storybook/react";
import * as stories from "@/components/members/member-form.stories";

const { NewMember, EditMember, LegacyMember, NameErrors } = composeStories(stories);

test("member onboarding requires first and last names but leaves middle name optional", () => {
  render(<NewMember />);
  expect(screen.getByRole("textbox", { name: "First Name" })).toBeRequired();
  expect(screen.getByRole("textbox", { name: "Last Name" })).toBeRequired();
  expect(screen.getByRole("textbox", { name: "Middle Name (Optional)" })).not.toBeRequired();
});

test("editing submits stored compound name parts independently", () => {
  render(<EditMember />);
  const first = screen.getByRole("textbox", { name: "First Name" }) as HTMLInputElement;
  const data = new FormData(first.form!);
  expect(data.get("firstName")).toBe("Juan Miguel");
  expect(data.get("middleName")).toBe("Reyes");
  expect(data.get("lastName")).toBe("Dela Cruz");
});

test("legacy members show their intact name without guessing name parts", () => {
  render(<LegacyMember />);
  expect(screen.getByText("Juan Miguel Reyes Dela Cruz")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "First Name" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Last Name" })).toHaveValue("");
});

test("server errors are accessible on each name input", async () => {
  render(<NameErrors />);
  fireEvent.submit((screen.getByRole("textbox", { name: "First Name" }) as HTMLInputElement).form!);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "First Name" })).toHaveAttribute("aria-invalid", "true"));
  expect(screen.getByRole("textbox", { name: "Middle Name (Optional)" })).toHaveAccessibleDescription("Check the middle name.");
  expect(screen.getByRole("textbox", { name: "Last Name" })).toHaveAccessibleDescription("Check the last name.");
});
