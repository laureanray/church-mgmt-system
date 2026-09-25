import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { FaceEnrollResult, FaceRemoveResult } from "@/app/(app)/members/actions";
import { Toaster } from "@/components/ui/sonner";
import { FaceEnrollmentCard } from "./face-enrollment-card";
import { SAMPLE_FACE_PHOTO } from "./face-photo.fixture";

/**
 * A member's face enrolment, on their page. The actions are local fakes that
 * answer after a short delay, so the busy state is visible and nothing leaves
 * the browser.
 */
const meta: Meta<typeof FaceEnrollmentCard> = {
  title: "Members/FaceEnrollmentCard",
  component: FaceEnrollmentCard,
};

export default meta;
type Story = StoryObj<typeof meta>;

const ENROLLED = {
  enrolledAt: "2026-09-20T09:14:00+08:00",
  enrolledByName: "Grace Mendoza",
  photoUrl: SAMPLE_FACE_PHOTO,
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function accept(): Promise<FaceEnrollResult> {
  await wait(800);
  return { status: "ok", enrolledAt: new Date().toISOString(), enrolledByName: "You" };
}

async function removed(): Promise<FaceRemoveResult> {
  await wait(800);
  return { status: "ok" };
}

function Preview(props: Partial<ComponentProps<typeof FaceEnrollmentCard>>) {
  return (
    <div className="max-w-sm p-6">
      <FaceEnrollmentCard
        memberName="Ana Santos"
        configured
        enrollment={null}
        canEdit
        enroll={accept}
        remove={removed}
        {...props}
      />
      <Toaster />
    </div>
  );
}

/** Not enrolled yet. "Upload photo" takes any image file; the fake accepts it. */
export const NotEnrolled: Story = { render: () => <Preview /> };

/** Enrolled: the photo, when, and by whom — with replace and remove. */
export const Enrolled: Story = { render: () => <Preview enrollment={ENROLLED} /> };

/** The staff account that enrolled them has since been deleted. */
export const EnrolledByFormerStaff: Story = {
  render: () => <Preview enrollment={{ ...ENROLLED, enrolledByName: null }} />,
};

/** Staff who may view members but not edit them see the state, and no actions. */
export const ReadOnly: Story = {
  render: () => <Preview enrollment={ENROLLED} canEdit={false} />,
};

export const ReadOnlyNotEnrolled: Story = {
  render: () => <Preview canEdit={false} />,
};

/** Upload a photo to see the refusal Tencent gives a poor one. */
export const Refused: Story = {
  render: () => (
    <Preview
      enroll={async () => {
        await wait(800);
        return {
          status: "error",
          message: "The face is too dark, blurred or turned away. Face the camera in good light.",
        };
      }}
    />
  ),
};

/** Removing while face recognition is unreachable leaves the enrolment alone. */
export const RemoveFails: Story = {
  render: () => (
    <Preview
      enrollment={ENROLLED}
      remove={async () => {
        await wait(800);
        return {
          status: "error",
          message: "Face recognition is busy. Wait a moment and try again.",
        };
      }}
    />
  ),
};

/** No Tencent credentials on this deployment: the card says so, and offers nothing. */
export const NotConfigured: Story = {
  render: () => <Preview configured={false} />,
};
