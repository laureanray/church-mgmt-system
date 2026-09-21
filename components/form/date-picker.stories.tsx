import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { Field } from "./field";
import { DatePicker } from "./date-picker";
import { Button } from "@/components/ui/button";

const meta = {
  title: "UI/DatePicker", component: DatePicker,
  args: { id: "birthdate", name: "birthdate" },
  render: (args) => <div className="max-w-sm p-4"><Field label="Birthdate" htmlFor={args.id}><DatePicker {...args} today={new Date(2026, 8, 21, 12)} /></Field></div>,
} satisfies Meta<typeof DatePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const WithValue: Story = { args: { defaultValue: "1988-03-14" } };
export const Disabled: Story = { args: { defaultValue: "1988-03-14", disabled: true } };
export const Required: Story = { args: { required: true } };
export const WithError: Story = { render: (args) => <div className="max-w-sm p-4"><Field label="Birthdate" htmlFor={args.id} error="Check the member’s birthdate."><DatePicker {...args} today={new Date(2026, 8, 21, 12)} /></Field></div> };

function SubmissionExample() {
  const [submitted, setSubmitted] = React.useState<string>();
  return <form className="max-w-sm space-y-4 p-4" onSubmit={(event) => { event.preventDefault(); setSubmitted(String(new FormData(event.currentTarget).get("birthdate"))); }}>
    <Field label="Birthdate" htmlFor="submitted-birthdate"><DatePicker id="submitted-birthdate" name="birthdate" today={new Date(2026, 8, 21, 12)} /></Field>
    <div className="flex gap-2"><Button type="submit">Preview submission</Button><Button type="reset" variant="outline" onClick={() => setSubmitted(undefined)}>Reset</Button></div>
    {submitted !== undefined ? <p role="status" className="text-sm">Submitted date: {submitted || "Not recorded"}</p> : null}
  </form>;
}
export const FormSubmission: Story = { render: () => <SubmissionExample /> };

export const Open: Story = {
  args: { defaultValue: "1988-03-14" },
  play: async ({ canvasElement }) => { await userEvent.click(within(canvasElement).getByRole("button", { name: "Choose date for birthdate" })); },
};
export const InvalidEntry: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox");
    await userEvent.type(input, "31/02/2026");
    await userEvent.tab();
  },
};
