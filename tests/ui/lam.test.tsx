import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as setlistStories from "@/components/lam/setlist-editor.stories";
import * as songFormStories from "@/components/lam/song-form.stories";
import * as teamStories from "@/components/lam/team-editor.stories";

function titles() {
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p")?.textContent);
}

describe("SetlistEditor", () => {
  const { Planned, ReadOnly, EmptyLibrary } = composeStories(setlistStories);

  test("shows each song's key, preferring the service's own", () => {
    render(<Planned />);
    expect(screen.getByText("Key D")).toBeInTheDocument(); // Way Maker, changed from E
    expect(screen.queryByText("Key E")).toBeNull();
    expect(screen.getByText("Key A")).toBeInTheDocument();
  });

  test("moves and removes songs", async () => {
    render(<Planned />);
    expect(titles()).toEqual(["Goodness of God", "Way Maker", "Dakilang Katapatan"]);
    expect(screen.getByRole("button", { name: "Move Goodness of God up" })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move Way Maker up" }));
    });
    await waitFor(() =>
      expect(titles()).toEqual(["Way Maker", "Goodness of God", "Dakilang Katapatan"]),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Dakilang Katapatan" }));
    });
    await waitFor(() => expect(titles()).toEqual(["Way Maker", "Goodness of God"]));
  });

  test("offers no controls without the line-up permission", () => {
    render(<ReadOnly />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  test("points to the library when it is empty", () => {
    render(<EmptyLibrary />);
    expect(screen.getByRole("link", { name: "Add a song" })).toHaveAttribute(
      "href",
      "/lam/songs/new",
    );
  });
});

describe("TeamEditor", () => {
  const { Scheduled, EmptyRoster } = composeStories(teamStories);

  test("groups the team by part, worship leader first", () => {
    render(<Scheduled />);
    const parts = screen.getAllByRole("term").map((term) => term.textContent);
    expect(parts).toEqual(["Worship Leader", "Vocals", "Keys", "Drums"]);
    const vocals = screen.getByText("Vocals").closest("div")!;
    expect(within(vocals).getByText("Joy Villanueva")).toBeInTheDocument();
    expect(within(vocals).getByText("Ana Lim")).toBeInTheDocument();
  });

  test("removes one assignment without touching the person's other part", async () => {
    render(<Scheduled />);
    // The removal runs as a form action in a transition; act flushes it.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Joy Villanueva from Vocals" }));
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove Joy Villanueva from Vocals" }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("button", { name: "Remove Joy Villanueva from Worship Leader" }),
    ).toBeInTheDocument();
  });

  test("sends people to the roster when no one can be scheduled", () => {
    render(<EmptyRoster />);
    expect(screen.getByRole("link", { name: "Add people to the roster" })).toHaveAttribute(
      "href",
      "/ministries/lam",
    );
    expect(screen.queryByRole("button", { name: "Schedule" })).toBeNull();
  });
});

describe("SongForm", () => {
  const { ValidationErrors } = composeStories(songFormStories);

  test("marks the fields the server rejected", async () => {
    render(<ValidationErrors />);
    const link = screen.getByRole("textbox", { name: "Chords or Lyrics Link" });
    fireEvent.submit((link as HTMLInputElement).form!);
    await waitFor(() => expect(link).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("spinbutton", { name: "Tempo (BPM)" })).toHaveAccessibleDescription(
      "Tempo seems too fast",
    );
  });
});
