"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { List, Share2 } from "lucide-react";

import type { GraphLink, GraphNode } from "@/lib/cell-graph";
import type { SelectOption } from "@/components/form/form-select";
import { CellGraph } from "@/components/cell-groups/cell-graph";
import { UnassignedPanel } from "@/components/cell-groups/unassigned-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CellRow = {
  id: string;
  name: string;
  leaderId: string | null;
  parentCellGroupId: string | null;
};

export function CellGroupsView({
  nodes,
  links,
  cells,
  unassigned,
  cellOptions,
  canManage,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  cells: CellRow[];
  unassigned: { id: string; name: string }[];
  cellOptions: SelectOption[];
  canManage: boolean;
}) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={view === "graph" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("graph")}
        >
          <Share2 className="size-4" /> Graph
        </Button>
        <Button
          variant={view === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("list")}
        >
          <List className="size-4" /> List
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend color="var(--color-primary)" label="Leader of leaders" />
          <Legend color="#10b981" label="Leader" />
          <Legend color="var(--color-muted-foreground)" label="Member" />
          <Legend color="#9ca3af" label="Unassigned" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          {view === "graph" ? (
            <CellGraph
              nodes={nodes}
              links={links}
              onSelect={setSelectedId}
              selectedId={selectedId}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All cell groups</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {cells.map((c) => (
                    <li key={c.id} className="py-2 text-sm">
                      <Link
                        href={`/cell-groups/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {selected ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">{selected.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p className="capitalize">{selected.tier.replace(/-/g, " ")}</p>
                <p>{selected.downlineCount} people in their downline</p>
                {selected.cellGroupId ? (
                  <Link
                    href={`/cell-groups/${selected.cellGroupId}`}
                    className="text-foreground hover:underline"
                  >
                    Open their cell group →
                  </Link>
                ) : null}
                <Link
                  href={`/members/${selected.id}`}
                  className="block text-foreground hover:underline"
                >
                  Open member profile →
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <UnassignedPanel
          people={unassigned}
          cellOptions={cellOptions}
          canManage={canManage}
        />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block size-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
