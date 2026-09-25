import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_FACE_CONSENT_NOTICE, faceConsentNoticeSchema } from "@/lib/face-consent";
import { FaceSettingsCard } from "./face-settings-card";

/**
 * Face check-in in Settings. The save and purge actions are local fakes: the
 * notice is validated as the server does, and the purge answers after a
 * second. Type "delete all face data" to enable Purge.
 */
const meta: Meta<typeof FaceSettingsCard> = {
  title: "Settings/FaceSettingsCard",
  component: FaceSettingsCard,
};

export default meta;
type Story = StoryObj<typeof meta>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Preview(props: Partial<ComponentProps<typeof FaceSettingsCard>>) {
  return (
    <div className="max-w-2xl p-6">
      <FaceSettingsCard
        configured
        enrolledCount={42}
        notice={DEFAULT_FACE_CONSENT_NOTICE}
        canEdit
        saveNotice={async (_prev, formData) => {
          await wait(500);
          const parsed = faceConsentNoticeSchema.safeParse(formData.get("notice"));
          if (!parsed.success) {
            const message = parsed.error.issues[0].message;
            return { errors: { notice: message }, message };
          }
          return { ok: true, message: "Consent notice saved." };
        }}
        purge={async () => {
          await wait(1000);
          return { status: "ok", removed: 42 };
        }}
        {...props}
      />
      <Toaster />
    </div>
  );
}

/** On, with members enrolled: the notice can be reworded, and everything purged. */
export const Default: Story = { render: () => <Preview /> };

/** Staff who may view settings but not change them. */
export const ReadOnly: Story = { render: () => <Preview canEdit={false} /> };

/** Nobody enrolled yet, so there is nothing to purge. */
export const NobodyEnrolled: Story = { render: () => <Preview enrolledCount={0} /> };

/** Face recognition unreachable: the purge says so and changes nothing. */
export const PurgeFails: Story = {
  render: () => (
    <Preview
      purge={async () => {
        await wait(1000);
        return {
          status: "error",
          message: "Face recognition is busy. Wait a moment and try again.",
        };
      }}
    />
  ),
};

/** Off on this deployment: the notice can still be prepared ahead of time. */
export const NotConfigured: Story = {
  render: () => <Preview configured={false} enrolledCount={0} />,
};
