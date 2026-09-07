import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Skeleton } from "./skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "UI/Skeleton",
  component: Skeleton,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  render: () => <Skeleton className="h-8 w-48" />,
};

/**
 * What `app/(app)/loading.tsx` renders while a route's data resolves.
 *
 * It deliberately mirrors the shape every page in the group shares — a
 * PageHeader, a row of StatCards, a framed table — rather than any one page's
 * layout, because the whole route group falls through this one boundary. Keep
 * the block sizes in step with the real components: a skeleton that settles
 * into differently-sized content reads as a layout jump.
 */
export const PageShell: Story = {
  render: () => (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>

      <div className="mt-6 space-y-3 rounded-lg border p-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  ),
};
