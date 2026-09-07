import * as React from "react";
import Link from "next/link";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailList, DetailRow } from "./detail-list";

const meta: Meta<typeof DetailList> = {
  title: "Patterns/DetailList",
  component: DetailList,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof DetailList>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Member Details</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailList>
          <DetailRow label="Birthdate" value="14 Mar 1988" />
          <DetailRow label="Kaanib ng IRM since" value="2014" />
          <DetailRow label="Name of Spouse" value="Maria Santos" />
          <DetailRow label="Contact Number" value="+63 917 555 0134" />
          <DetailRow
            label="Cell Group"
            value={<Link href="/cell-groups/1" className="hover:underline">Bagong Pag-asa</Link>}
          />
        </DetailList>
      </CardContent>
    </Card>
  ),
};

/**
 * Nullable columns are passed straight through and render as an em dash. Watch
 * the zero: `value={0}` is falsy, so a genuine count of nothing would show a
 * dash instead — pass `String(0)`.
 */
export const WithEmptyValues: Story = {
  render: () => (
    <DetailList>
      <DetailRow label="Birthdate" value={null} />
      <DetailRow label="Wedding Anniversary" value={undefined} />
      <DetailRow label="Occupation" value="" />
      <DetailRow label="Cell Group" value={<Badge variant="outline">Not in a cell group</Badge>} />
      <DetailRow label="Services attended" value={String(0)} />
    </DetailList>
  ),
};
