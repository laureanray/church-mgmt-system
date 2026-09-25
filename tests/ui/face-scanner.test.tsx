import { describe, expect, mock, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FaceScannerView } from "@/components/scan/face-scanner";
import * as stories from "@/components/scan/face-scanner.stories";

const { NoService, Ready, Recognising, Welcome, AlreadyIn, NoMatch, Problem, CameraDenied } =
  composeStories(stories);

describe("FaceScannerView", () => {
  test("waits for a service before starting the camera", () => {
    render(<NoService />);
    expect(screen.getByText("Select a service to start the camera.")).toBeInTheDocument();
    expect(screen.queryByText(/One person at a time/)).toBeNull();
  });

  test("asks for one person at a time while live", () => {
    render(<Ready />);
    expect(screen.getByText("One person at a time · look at the camera")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  test("says when it is recognising", () => {
    render(<Recognising />);
    expect(screen.getByText("Recognising…")).toBeInTheDocument();
  });

  test("welcomes a member by first name", () => {
    render(<Welcome />);
    expect(screen.getByRole("status")).toHaveTextContent("Welcome, Ana!");
  });

  test("tells someone already in when they were checked in", () => {
    render(<AlreadyIn />);
    expect(screen.getByRole("status")).toHaveTextContent(/Already checked in at/);
  });

  test("points a stranger to the name search", () => {
    render(<NoMatch />);
    expect(screen.getByRole("status")).toHaveTextContent("Check them in by name below");
  });

  test("raises a problem only an administrator can fix as an alert", () => {
    render(<Problem />);
    expect(screen.getByRole("alert")).toHaveTextContent("Ask an administrator");
  });

  test("offers to retry a blocked camera", () => {
    render(<CameraDenied />);
    expect(screen.getByRole("button", { name: "Retry camera" })).toBeInTheDocument();
  });

  test("asks the usher to confirm a likely match, and reports the answer", async () => {
    const user = userEvent.setup();
    const onConfirm = mock();
    const onReject = mock();
    render(
      <FaceScannerView
        active
        camera="live"
        overlay={{ kind: "confirm", memberId: "ruth", memberName: "Ruth Villanueva", memberStatus: "active" }}
        onConfirm={onConfirm}
        onReject={onReject}
      />,
    );

    expect(screen.getByRole("alertdialog", { name: "Confirm who this is" })).toHaveTextContent(
      "Ruth Villanueva?",
    );
    await user.click(screen.getByRole("button", { name: "Yes, check in" }));
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});
