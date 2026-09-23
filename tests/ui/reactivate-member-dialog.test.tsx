import { describe, expect, mock, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as stories from "@/components/scan/reactivate-member-dialog.stories";
import { ReactivateMemberDialog } from "@/components/scan/reactivate-member-dialog";

const { Inactive, Deceased, Failed } = composeStories(stories);

const CHECK_IN = {
  memberId: "sample-member",
  memberName: "Dennis Santos",
  status: "inactive" as const,
};

describe("ReactivateMemberDialog", () => {
  test("asks the question and names the member and their status", async () => {
    render(<Inactive />);

    const dialog = await screen.findByRole("dialog", {
      name: "Mark as active again?",
    });
    expect(dialog).toHaveTextContent("Dennis Santos is checked in");
    expect(dialog).toHaveTextContent("lists them as inactive");
    expect(
      screen.getByRole("button", { name: "Keep as inactive" }),
    ).toBeInTheDocument();
  });

  test("names a record-only status the same way", async () => {
    render(<Deceased />);

    expect(
      await screen.findByRole("button", { name: "Keep as deceased" }),
    ).toBeInTheDocument();
  });

  test("stays closed without a check-in", () => {
    render(
      <ReactivateMemberDialog
        checkIn={null}
        reactivate={mock()}
        onClose={mock()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("confirming reactivates that member, then closes", async () => {
    const user = userEvent.setup();
    const reactivate = mock(async () => ({ status: "ok" as const }));
    const onClose = mock();
    render(
      <ReactivateMemberDialog
        checkIn={CHECK_IN}
        reactivate={reactivate}
        onClose={onClose}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Mark as active" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(reactivate).toHaveBeenCalledWith("sample-member");
  });

  test("reports a successful reactivation so the caller can update its view", async () => {
    const user = userEvent.setup();
    const onReactivated = mock();
    render(
      <ReactivateMemberDialog
        checkIn={CHECK_IN}
        reactivate={async () => ({ status: "ok" })}
        onReactivated={onReactivated}
        onClose={mock()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Mark as active" }));

    await waitFor(() => expect(onReactivated).toHaveBeenCalledWith("sample-member"));
  });

  test("a refused update is not reported as a reactivation", async () => {
    const user = userEvent.setup();
    const onReactivated = mock();
    const onClose = mock();
    render(
      <ReactivateMemberDialog
        checkIn={CHECK_IN}
        reactivate={async () => ({ status: "error", message: "Already changed." })}
        onReactivated={onReactivated}
        onClose={onClose}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Mark as active" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onReactivated).not.toHaveBeenCalled();
  });

  test("declining leaves the member alone", async () => {
    const user = userEvent.setup();
    const reactivate = mock(async () => ({ status: "ok" as const }));
    const onClose = mock();
    render(
      <ReactivateMemberDialog
        checkIn={CHECK_IN}
        reactivate={reactivate}
        onClose={onClose}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Keep as inactive" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(reactivate).not.toHaveBeenCalled();
  });

  test("a refused update still closes the prompt", async () => {
    const user = userEvent.setup();
    render(<Failed />);

    await user.click(await screen.findByRole("button", { name: "Mark as active" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Mark as active again?" })).toBeNull(),
    );
  });
});
