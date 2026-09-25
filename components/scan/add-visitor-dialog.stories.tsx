import * as React from "react";
import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { AddVisitorState } from "@/app/(app)/scan/actions";
import { Button } from "@/components/ui/button";
import { DEFAULT_FACE_CONSENT_NOTICE } from "@/lib/face-consent";
import { AddVisitorDialog } from "./add-visitor-dialog";

/**
 * Adding a first-time visitor at the door. The action is a local fake: it
 * refuses an empty name as the server does, and otherwise "checks them in"
 * after a moment. "Last added" shows who came back.
 */
const meta: Meta<typeof AddVisitorDialog> = {
  title: "Scan/AddVisitorDialog",
  component: AddVisitorDialog,
};

export default meta;
type Story = StoryObj<typeof meta>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fakeAdd(_prev: AddVisitorState, formData: FormData): Promise<AddVisitorState> {
  await wait(600);
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const errors: Record<string, string> = {};
  if (!firstName) errors.firstName = "First name is required";
  if (!lastName) errors.lastName = "Last name is required";
  if (Object.keys(errors).length) {
    return { status: "error", message: "Please fix the highlighted fields.", errors };
  }
  return {
    status: "ok",
    checkIn: {
      status: "ok",
      memberId: "new-visitor",
      memberName: `${firstName} ${lastName}`,
      memberStatus: "visitor",
      at: new Date().toISOString(),
    },
  };
}

function Preview(props: Partial<ComponentProps<typeof AddVisitorDialog>>) {
  const [open, setOpen] = React.useState(true);
  const [added, setAdded] = React.useState<string | null>(null);
  return (
    <div className="space-y-2 p-6">
      <Button onClick={() => setOpen(true)}>Add a visitor</Button>
      <p className="text-sm text-muted-foreground">Last added: {added ?? "nobody yet"}</p>
      <AddVisitorDialog
        open={open}
        onOpenChange={setOpen}
        action={fakeAdd}
        onAdded={(checkIn) => setAdded(checkIn.memberName)}
        {...props}
      />
    </div>
  );
}

/** With face check-in on: name, number, and a photo once they consent. */
export const WithPhoto: Story = {
  render: () => <Preview face={{ notice: DEFAULT_FACE_CONSENT_NOTICE }} />,
};

/** Face check-in off, or this user may not enrol faces: the name is enough. */
export const NameOnly: Story = { render: () => <Preview /> };

/** Face recognition refused the photo: nothing was created, and the form stays filled. */
export const PhotoRefused: Story = {
  render: () => (
    <Preview
      face={{ notice: DEFAULT_FACE_CONSENT_NOTICE }}
      action={async () => {
        await wait(600);
        const message = "No face found. Face the camera, in good light.";
        return { status: "error", message, errors: { facePhoto: message } };
      }}
    />
  ),
};
