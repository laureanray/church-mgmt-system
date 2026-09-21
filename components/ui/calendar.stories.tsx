import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Calendar } from "./calendar";
const meta = { title: "UI/Calendar", component: Calendar } satisfies Meta<typeof Calendar>;
export default meta;
type Story = StoryObj<typeof meta>;
function CalendarExample({ initial }: { initial?: Date }) {
  const [selected, setSelected] = React.useState(initial);
  return <Calendar mode="single" defaultMonth={initial ?? new Date(2026, 8)} today={new Date(2026, 8, 21)} selected={selected} onSelect={setSelected} />;
}
export const Default: Story = { render: () => <CalendarExample /> };
export const Selected: Story = { render: () => <CalendarExample initial={new Date(1988, 2, 14)} /> };
