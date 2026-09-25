import { describe, expect, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as stories from "@/components/members/face-enrollment-card.stories";

const { NotConfigured, NotEnrolled, Enrolled, EnrolledByFormerStaff, ReadOnly, RemoveFails } =
  composeStories(stories);

describe("FaceEnrollmentCard", () => {
  test("says when face check-in is not set up, and offers nothing", () => {
    render(<NotConfigured />);
    expect(screen.getByText("Face check-in is not set up")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("offers a photo to a member not yet enrolled", () => {
    render(<NotEnrolled />);
    expect(screen.getByText("Not enrolled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  test("shows the photo, when and by whom, with replace and remove", () => {
    render(<Enrolled />);
    expect(screen.getByText("Enrolled")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Enrolment photo of Ana Santos" })).toBeInTheDocument();
    expect(screen.getByText("by Grace Mendoza")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retake" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Ana Santos’s face" })).toBeInTheDocument();
  });

  test("names a deleted staff account without inventing one", () => {
    render(<EnrolledByFormerStaff />);
    expect(screen.getByText("by a former staff account")).toBeInTheDocument();
  });

  test("shows the state but no actions to staff who cannot edit members", () => {
    render(<ReadOnly />);
    expect(screen.getByText("Enrolled")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("removes after confirming, and shows the member as not enrolled", async () => {
    const user = userEvent.setup();
    render(<Enrolled />);

    await user.click(screen.getByRole("button", { name: "Remove Ana Santos’s face" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove Ana Santos’s face?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("Not enrolled", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Enrolment photo/ })).toBeNull();
  });

  test("keeps the enrolment and explains when removal fails", async () => {
    const user = userEvent.setup();
    render(<RemoveFails />);

    await user.click(screen.getByRole("button", { name: "Remove Ana Santos’s face" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(
      await screen.findByText("Face recognition is busy. Wait a moment and try again.", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Enrolled")).toBeInTheDocument();
  });
});
