import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DEFAULT_FACE_CONSENT_NOTICE } from "@/lib/face-consent";
import { FacePhotoField } from "./face-photo-field";

/**
 * The optional face step inside a form that creates someone. Tick consent to
 * enable Take photo (this device's camera) and Upload photo; the photo then
 * waits in the form until it is saved.
 */
const meta: Meta<typeof FacePhotoField> = {
  title: "Members/FacePhotoField",
  component: FacePhotoField,
  args: { notice: DEFAULT_FACE_CONSENT_NOTICE, subject: "They", disabled: false },
  decorators: [
    (Story) => (
      <form className="max-w-md p-6" onSubmit={(event) => event.preventDefault()}>
        <Story />
      </form>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A named member, as on the new-member form once the name is known. */
export const Named: Story = { args: { subject: "Ana Santos" } };

/** Face recognition refused the photo taken with the form. */
export const PhotoRefused: Story = {
  args: {
    errors: {
      facePhoto: "The face is too dark, blurred or turned away. Face the camera in good light.",
    },
  },
};

/** The server found a photo without the consent tick (the form was bypassed). */
export const ConsentMissing: Story = {
  args: { errors: { faceConsent: "Record their consent before adding a photo of their face." } },
};

/** While the form is saving. */
export const Disabled: Story = { args: { disabled: true } };
