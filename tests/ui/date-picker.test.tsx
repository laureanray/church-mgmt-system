import { expect, test } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { composeStories } from "@storybook/react";
import * as stories from "@/components/form/date-picker.stories";
const { WithValue, WithError, Disabled, FormSubmission } = composeStories(stories);

test("date picker labels the editable control and shows month-first dates", () => {
  render(<WithValue />);
  expect(screen.getByRole("textbox", { name: "Birthdate" })).toHaveValue("03/14/1988");
});
test("date picker forwards Field errors onto the visible input", () => {
  render(<WithError />);
  const input = screen.getByRole("textbox", { name: "Birthdate" });
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription(/Check the member/);
});
test("disabled date picker disables both entry and calendar", () => {
  render(<Disabled />);
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByRole("button", { name: /Choose date/ })).toBeDisabled();
});
test("typed dates submit ISO and reset clears the draft and hidden value", async () => {
  render(<FormSubmission />);
  const input = screen.getByRole("textbox", { name: "Birthdate" }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "03/14/1988" } });
  expect(new FormData(input.form!).get("birthdate")).toBe("1988-03-14");
  fireEvent.change(input, { target: { value: "02/31/2026" } });
  fireEvent.blur(input);
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid date");
  expect(input.checkValidity()).toBe(false);
  fireEvent.reset(input.form!);
  await waitFor(() => expect(input).toHaveValue(""));
  expect(new FormData(input.form!).get("birthdate")).toBe("");
  expect(input.checkValidity()).toBe(true);
});
