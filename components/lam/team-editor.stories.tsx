import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import type { LineupFormState } from "@/app/(app)/lam/actions";
import type { SelectOption } from "@/components/form/form-select";
import { LINEUP_PARTS, type LineupPart } from "@/lib/constants";
import { TeamEditor, type TeamAssignment } from "./team-editor";

const ROSTER: SelectOption[] = [
  { value: "m1", label: "Joy Villanueva" },
  { value: "m2", label: "Mark Bautista" },
  { value: "m3", label: "Ana Lim" },
  { value: "m4", label: "Paolo Garcia" },
];

const SCHEDULED: TeamAssignment[] = [
  { id: "a1", memberName: "Joy Villanueva", part: "worship_leader" },
  { id: "a2", memberName: "Joy Villanueva", part: "vocals" },
  { id: "a3", memberName: "Ana Lim", part: "vocals" },
  { id: "a4", memberName: "Mark Bautista", part: "keys" },
  { id: "a5", memberName: "Paolo Garcia", part: "drums" },
];

/** Runs the editor against local state, so scheduling works in Storybook. */
function TeamEditorStory({
  initial,
  roster,
  canEdit,
  rosterHref,
}: {
  initial: TeamAssignment[];
  roster: SelectOption[];
  canEdit: boolean;
  rosterHref?: string | null;
}) {
  const [assignments, setAssignments] = useState(initial);

  async function add(
    _state: LineupFormState,
    formData: FormData,
  ): Promise<LineupFormState> {
    const member = roster.find((m) => m.value === formData.get("memberId"));
    const part = formData.get("part") as LineupPart;
    if (!member) return { errors: { memberId: "Choose who is serving" } };
    if (!LINEUP_PARTS.includes(part)) return { errors: { part: "Choose a part" } };
    if (assignments.some((a) => a.memberName === member.label && a.part === part)) {
      return { errors: { part: "They are already down for that part." } };
    }
    setAssignments((current) => [
      ...current,
      { id: crypto.randomUUID(), memberName: member.label, part },
    ]);
    return undefined;
  }

  async function remove(id: string) {
    setAssignments((current) => current.filter((a) => a.id !== id));
  }

  return (
    <div className="max-w-2xl">
      <TeamEditor
        assignments={assignments}
        roster={roster}
        canEdit={canEdit}
        rosterHref={rosterHref}
        addAction={add}
        removeAction={remove}
      />
    </div>
  );
}

const meta = {
  title: "LAM/TeamEditor",
  component: TeamEditorStory,
  parameters: { layout: "padded" },
  args: { initial: SCHEDULED, roster: ROSTER, canEdit: true, rosterHref: "/ministries/lam" },
} satisfies Meta<typeof TeamEditorStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Grouped by part, worship leader first. Adding the same part twice is refused. */
export const Scheduled: Story = {};

export const Empty: Story = { args: { initial: [] } };

export const ReadOnly: Story = { args: { canEdit: false } };

/** Nobody on the LAM roster yet: scheduling points at the roster instead. */
export const EmptyRoster: Story = { args: { initial: [], roster: [] } };
