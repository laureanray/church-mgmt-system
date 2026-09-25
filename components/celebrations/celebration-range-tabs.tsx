"use client";

import Link from "next/link";

import {
  CELEBRATION_RANGES,
  CELEBRATION_RANGE_LABELS,
  type CelebrationRange,
} from "@/lib/celebrations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Switches /celebrations between the next seven days and this month.
 *
 * The range lives in `?range=`, so each tab is a link and only the selected
 * panel is ever rendered: the server reads the range back from the URL and
 * passes the matching list in as `children`. That keeps a range linkable and
 * the back button honest, the same as every table's state.
 */
export function CelebrationRangeTabs({
  range,
  path = "/celebrations",
  children,
}: {
  range: CelebrationRange;
  path?: string;
  children: React.ReactNode;
}) {
  return (
    // Keyed so Back and Forward remount it: the roving tabindex otherwise
    // stays on the tab just left, so Tab would land on the unselected one.
    <Tabs key={range} value={range}>
      <TabsList>
        {CELEBRATION_RANGES.map((value) => (
          <TabsTrigger
            key={value}
            value={value}
            nativeButton={false}
            render={<Link href={`${path}?range=${value}`} scroll={false} />}
          >
            {CELEBRATION_RANGE_LABELS[value]}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={range}>{children}</TabsContent>
    </Tabs>
  );
}
