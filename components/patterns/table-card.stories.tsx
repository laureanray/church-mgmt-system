import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableCard } from "./table-card";

const meta: Meta<typeof TableCard> = {
  title: "Patterns/TableCard",
  component: TableCard,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof TableCard>;

const ROWS = [
  { name: "Ana Reyes", status: "Married", year: 2014, contact: "+63 917 555 0134" },
  { name: "Ben Cruz", status: "Single", year: 2019, contact: "+63 918 555 0177" },
  { name: "Carla Dizon", status: "Widowed", year: 2008, contact: "—" },
];

export const Default: Story = {
  render: () => (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Marital Status</TableHead>
            <TableHead>Member Since</TableHead>
            <TableHead>Contact</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map((r) => (
            <TableRow key={r.name}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{r.status}</Badge>
              </TableCell>
              <TableCell className="tabular-nums">{r.year}</TableCell>
              <TableCell className="text-muted-foreground">{r.contact}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  ),
};
