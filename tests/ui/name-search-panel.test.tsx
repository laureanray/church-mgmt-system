import { describe, expect, mock, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as stories from "@/components/scan/name-search-panel.stories";
import { NameSearchPanel } from "@/components/scan/name-search-panel";
import type { CheckInCandidate } from "@/server/attendance";

const { Matches, ReturningMember, NoMatches, SearchFailed } =
  composeStories(stories);

const ANA: CheckInCandidate = {
  id: "ana",
  fullName: "Ana Santos",
  status: "active",
  cellGroupName: "Joshua Cell",
  birthYear: 1994,
};
const DENNIS: CheckInCandidate = {
  id: "dennis",
  fullName: "Dennis Santos",
  status: "inactive",
  cellGroupName: null,
  birthYear: null,
};

function setup(
  onSelect = mock(async (_member: CheckInCandidate) => true),
  search = mock(async (_query: string) => [ANA, DENNIS]),
) {
  const user = userEvent.setup();
  render(<NameSearchPanel search={search} onSelect={onSelect} />);
  const box = screen.getByRole("combobox", { name: "Check in by name" });
  return { user, box, search, onSelect };
}

describe("NameSearchPanel", () => {
  test("lists matches with what tells namesakes apart", async () => {
    render(<Matches />);

    const options = await screen.findAllByRole("option");
    expect(options.length).toBeGreaterThan(1);
    expect(options[0]).toHaveTextContent("Ana Santos");
    expect(options[0]).toHaveTextContent("Joshua Cell · Born 1994");
    expect(options[1]).toHaveTextContent("Caleb Cell · Born 2008");
  });

  test("flags a lapsed member rather than hiding them", async () => {
    render(<ReturningMember />);

    const [option] = await screen.findAllByRole("option");
    expect(option).toHaveTextContent("Dennis Santos");
    expect(option).toHaveTextContent("Inactive");
    expect(option).toHaveTextContent("No cell group");
  });

  test("says so when nobody matches", async () => {
    render(<NoMatches />);

    expect(
      await screen.findByText("No member matches “Zacarias”"),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  test("reports a failed search", async () => {
    render(<SearchFailed />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The search failed",
    );
  });

  test("waits for two letters before searching", async () => {
    const { user, box, search } = setup();

    await user.type(box, "a");
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(search).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  test("the arrow keys and Enter check in the highlighted member", async () => {
    const { user, box, onSelect } = setup();

    await user.type(box, "san");
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect.mock.calls[0][0]).toEqual(DENNIS);
  });

  test("clears the box and keeps focus for the next name", async () => {
    const { user, box } = setup();

    await user.type(box, "san");
    await user.click((await screen.findAllByRole("option"))[0]);

    await waitFor(() => expect(box).toHaveValue(""));
    expect(box).toHaveFocus();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  test("keeps the name when the check-in did not go through", async () => {
    const onSelect = mock(async (_member: CheckInCandidate) => false);
    const { user, box } = setup(onSelect);

    await user.type(box, "san");
    await user.click((await screen.findAllByRole("option"))[0]);

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(box).toHaveValue("san");
    expect(box).toHaveFocus();
  });

  test("Escape clears the box", async () => {
    const { user, box } = setup();

    await user.type(box, "san");
    await screen.findAllByRole("option");
    await user.keyboard("{Escape}");

    expect(box).toHaveValue("");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  test("a slow answer to an earlier query does not replace the latest", async () => {
    let releaseFirst: (rows: CheckInCandidate[]) => void = () => {};
    const search = mock((query: string) =>
      query === "an"
        ? new Promise<CheckInCandidate[]>((resolve) => {
            releaseFirst = resolve;
          })
        : Promise.resolve([DENNIS]),
    );
    const { user, box } = setup(undefined, search);

    await user.type(box, "an");
    await waitFor(() => expect(search).toHaveBeenCalledWith("an"));
    await user.clear(box);
    await user.type(box, "den");
    await screen.findByRole("option", { name: /Dennis Santos/ });
    releaseFirst([ANA]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Dennis Santos");
  });
});
