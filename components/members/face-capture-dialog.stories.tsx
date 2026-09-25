import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FaceCaptureDialog, FaceCaptureView, type FaceCaptureStage } from "./face-capture-dialog";
import { SAMPLE_FACE_PHOTO } from "./face-photo.fixture";

/**
 * Taking an enrolment photo with the device's front camera. The stages below
 * are the dialog's body drawn from props, so they render without a camera;
 * "With camera" is the real dialog and asks the browser for one.
 */
const meta: Meta<typeof FaceCaptureView> = {
  title: "Members/FaceCaptureDialog",
  component: FaceCaptureView,
};

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => {};

function Stage(props: {
  stage: FaceCaptureStage;
  cameraMessage?: string;
  error?: string;
  busy?: boolean;
}) {
  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <FaceCaptureView
          previewUrl={props.stage === "captured" ? SAMPLE_FACE_PHOTO : null}
          onCapture={noop}
          onRetake={noop}
          onUse={noop}
          onRetry={noop}
          {...props}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Waiting for the camera, or for the browser's permission prompt. */
export const Starting: Story = { render: () => <Stage stage="starting" /> };

/** The camera is running; the oval is where the face goes. Black here, with no camera. */
export const Live: Story = { render: () => <Stage stage="live" /> };

/** A photo taken, waiting to be used or retaken. */
export const Captured: Story = { render: () => <Stage stage="captured" /> };

/** The photo is with face recognition. */
export const Enrolling: Story = { render: () => <Stage stage="captured" busy /> };

/** Face recognition refused the photo, and says why. */
export const Refused: Story = {
  render: () => (
    <Stage
      stage="captured"
      error="The face is too dark, blurred or turned away. Face the camera in good light."
    />
  ),
};

export const CameraDenied: Story = {
  render: () => (
    <Stage
      stage="denied"
      cameraMessage="Camera access was blocked. Allow the camera for this site in the browser’s settings, then try again."
    />
  ),
};

export const NoCamera: Story = {
  render: () => <Stage stage="unavailable" cameraMessage="No camera was found on this device." />,
};

/**
 * The real dialog, with this device's camera. "Use this photo" is accepted
 * after a second, unless the photo is taken within the first ten seconds of
 * opening — then it is refused, to show the retake path.
 */
export const WithCamera: Story = {
  render: function WithCamera() {
    const [open, setOpen] = React.useState(false);
    const [openedAt, setOpenedAt] = React.useState(0);
    return (
      <div className="p-6">
        <Button
          onClick={() => {
            setOpenedAt(Date.now());
            setOpen(true);
          }}
        >
          Take photo
        </Button>
        <FaceCaptureDialog
          open={open}
          onOpenChange={setOpen}
          onUse={async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return Date.now() - openedAt < 10_000
              ? "The face is too small. Step closer to the camera."
              : null;
          }}
        />
      </div>
    );
  },
};
