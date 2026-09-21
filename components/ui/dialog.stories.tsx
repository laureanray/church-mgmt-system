import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "./dialog";

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger render={<Button variant="outline" />}>View service details</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sunday worship</DialogTitle>
          <DialogDescription>Review the service details before checking in members.</DialogDescription>
        </DialogHeader>
        <p>Bring each member’s QR code to the welcome desk.</p>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  ),
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { defaultOpen: true } };
/** A visual confirmation example; both actions only close this isolated story. */
export const Destructive: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger render={<Button variant="destructive" />}>Delete service</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete service?</DialogTitle>
          <DialogDescription>This removes the service and its attendance records. This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <DialogClose render={<Button variant="destructive" />}>Delete service</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
