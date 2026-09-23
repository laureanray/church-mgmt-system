import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentProps } from "react";

import type { SongFormState } from "@/app/(app)/lam/actions";
import { SongForm } from "./song-form";

function SongFormStory({
  result,
  ...props
}: Omit<ComponentProps<typeof SongForm>, "action"> & {
  /** What the stand-in server action returns on submit. */
  result?: SongFormState;
}) {
  return <SongForm {...props} action={async () => result} />;
}

const meta = {
  title: "LAM/SongForm",
  component: SongFormStory,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SongFormStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const Edit: Story = {
  args: {
    song: {
      title: "Way Maker",
      artist: "Sinach",
      defaultKey: "E",
      tempo: 68,
      referenceUrl: "https://example.com/way-maker-chords",
      notes: "Bridge twice before the final chorus.",
    },
  },
};

/** Submit to see server validation errors on the link and tempo. */
export const ValidationErrors: Story = {
  args: {
    song: {
      title: "Way Maker",
      artist: null,
      defaultKey: null,
      tempo: null,
      referenceUrl: null,
      notes: null,
    },
    result: {
      message: "Please fix the highlighted fields.",
      errors: {
        referenceUrl: "Enter a link starting with http:// or https://",
        tempo: "Tempo seems too fast",
      },
    },
  },
};
