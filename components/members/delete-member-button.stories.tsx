import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DeleteMemberButton } from "./delete-member-button";

/**
 * Delete on a member's page. The stories answer with local fakes: the real
 * action redirects to the directory on success, which a story cannot follow,
 * so "Deletes" just settles.
 */
const meta: Meta<typeof DeleteMemberButton> = {
  title: "Members/DeleteMemberButton",
  component: DeleteMemberButton,
};

export default meta;
type Story = StoryObj<typeof meta>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const Deletes: Story = {
  render: () => (
    <div className="p-6">
      <DeleteMemberButton
        id="ana"
        name="Ana Santos"
        deleteMember={async () => {
          await wait(800);
          return undefined;
        }}
      />
    </div>
  ),
};

/** Face recognition could not remove their face, so the member stays. */
export const FaceNotRemoved: Story = {
  render: () => (
    <div className="p-6">
      <DeleteMemberButton
        id="ana"
        name="Ana Santos"
        deleteMember={async () => {
          await wait(800);
          return {
            error:
              "Their face could not be removed from face recognition, so the member was not deleted. Try again in a moment.",
          };
        }}
      />
    </div>
  ),
};
