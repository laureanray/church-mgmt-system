import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { CheckInResult, FaceScanResult } from "@/app/(app)/scan/actions";
import { FaceScanner, FaceScannerView } from "./face-scanner";

/**
 * The face camera on the check-in screen. Every state below is drawn from
 * props, so it renders without a camera: the picture is black where the video
 * would be. "Live camera" at the end runs the real loop against a fake
 * recogniser, and asks the browser for a camera.
 */
const meta: Meta<typeof FaceScannerView> = {
  title: "Scan/FaceScanner",
  component: FaceScannerView,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

function View(props: Partial<ComponentProps<typeof FaceScannerView>>) {
  return (
    <div className="max-w-md">
      <FaceScannerView
        active
        camera="live"
        onConfirm={() => {}}
        onReject={() => {}}
        onRetry={() => {}}
        onSwitchCamera={() => {}}
        {...props}
      />
    </div>
  );
}

/** No service chosen yet, so the camera stays off. */
export const NoService: Story = { render: () => <View active={false} camera="idle" /> };

export const Starting: Story = { render: () => <View camera="starting" /> };

/** Watching the doorway. Nothing is sent until something moves. */
export const Ready: Story = { render: () => <View /> };

/** A frame is with face recognition. */
export const Recognising: Story = { render: () => <View looking /> };

export const Welcome: Story = {
  render: () => (
    <View
      overlay={{
        kind: "welcome",
        memberName: "Ana Santos",
        memberStatus: "active",
        status: "ok",
        at: "2026-09-27T09:02:00+08:00",
      }}
    />
  ),
};

/** Recognised, but already checked in — by name, or on an earlier pass. */
export const AlreadyIn: Story = {
  render: () => (
    <View
      overlay={{
        kind: "welcome",
        memberName: "Ana Santos",
        memberStatus: "active",
        status: "duplicate",
        at: "2026-09-27T08:55:00+08:00",
      }}
    />
  ),
};

/** A lapsed member is welcomed with their status shown; the screen then offers to reactivate. */
export const WelcomeBack: Story = {
  render: () => (
    <View
      overlay={{
        kind: "welcome",
        memberName: "Dennis Santos",
        memberStatus: "inactive",
        status: "ok",
        at: "2026-09-27T09:04:00+08:00",
      }}
    />
  ),
};

/** A likely match (score 80–90): the usher confirms before anything is recorded. */
export const Confirm: Story = {
  render: () => (
    <View
      overlay={{
        kind: "confirm",
        memberId: "ruth",
        memberName: "Ruth Villanueva",
        memberStatus: "active",
      }}
    />
  ),
};

export const Confirming: Story = {
  render: () => (
    <View
      confirmBusy
      overlay={{
        kind: "confirm",
        memberId: "ruth",
        memberName: "Ruth Villanueva",
        memberStatus: "active",
      }}
    />
  ),
};

export const NoMatch: Story = { render: () => <View overlay={{ kind: "no_match" }} /> };

/** A face Tencent would not use, with what to do about it. */
export const Hint: Story = {
  render: () => (
    <View overlay={{ kind: "hint", message: "The face is too small. Step closer to the camera." }} />
  ),
};

/** Keys, billing or the connection: nothing the person at the door can fix. */
export const Problem: Story = {
  render: () => (
    <View
      overlay={{
        kind: "problem",
        message:
          "Face recognition is switched off on the Tencent Cloud account (billing or service status). Ask an administrator.",
      }}
    />
  ),
};

export const CameraDenied: Story = {
  render: () => (
    <View
      camera="denied"
      cameraMessage="Camera access was blocked. Allow the camera for this site in the browser’s settings, then try again."
    />
  ),
};

/**
 * The real loop, on this device's camera, against a fake recogniser that
 * takes turns: Ana (checked in), Ruth (asks to confirm), nobody, an empty
 * frame. Move in front of the camera to trigger a search.
 */
export const LiveCamera: Story = {
  render: () => {
    let turn = 0;
    const checkIn = (memberId: string, memberName: string): CheckInResult => ({
      status: "ok",
      memberId,
      memberName,
      memberStatus: "active",
      at: new Date().toISOString(),
    });
    const identify = async (): Promise<FaceScanResult> => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const results: FaceScanResult[] = [
        {
          status: "checked_in",
          score: 98.2,
          checkIn: {
            status: "ok",
            memberId: "ana",
            memberName: "Ana Santos",
            memberStatus: "active",
            at: new Date().toISOString(),
          },
        },
        {
          status: "confirm",
          memberId: "ruth",
          memberName: "Ruth Villanueva",
          memberStatus: "active",
          score: 84.1,
        },
        { status: "no_match" },
        { status: "no_face" },
      ];
      return results[turn++ % results.length];
    };
    return (
      <div className="max-w-md">
        <FaceScanner
          active
          identify={identify}
          confirm={async (memberId) => checkIn(memberId, "Ruth Villanueva")}
          onCheckedIn={() => {}}
        />
      </div>
    );
  },
};
