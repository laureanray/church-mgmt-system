import { describe, expect, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen } from "@testing-library/react";

import * as stories from "@/components/members/face-capture-dialog.stories";

const { Starting, Live, Captured, Enrolling, Refused, CameraDenied } = composeStories(stories);

describe("FaceCaptureView", () => {
  test("cannot take a photo until the camera is live", async () => {
    render(<Starting />);
    expect(await screen.findByText("Starting camera…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
  });

  test("takes a photo once live", async () => {
    render(<Live />);
    expect(await screen.findByRole("button", { name: "Take photo" })).toBeEnabled();
  });

  test("shows the photo taken, to use or retake", async () => {
    render(<Captured />);
    expect(await screen.findByRole("img", { name: "The photo just taken" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use this photo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Retake" })).toBeEnabled();
  });

  test("holds both buttons while enrolling", async () => {
    render(<Enrolling />);
    expect(await screen.findByRole("button", { name: "Enrolling…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retake" })).toBeDisabled();
  });

  test("explains a refused photo", async () => {
    render(<Refused />);
    expect(await screen.findByRole("alert")).toHaveTextContent("too dark, blurred or turned away");
  });

  test("explains a blocked camera and offers to try again", async () => {
    render(<CameraDenied />);
    expect(await screen.findByText(/Camera access was blocked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
