"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";

import type { GraphLink, GraphNode } from "@/lib/cell-graph";

type SimNode = GraphNode & {
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
};

const TIER_STYLE: Record<
  GraphNode["tier"],
  { fill: string; r: number; label: boolean }
> = {
  "leader-of-leaders": { fill: "var(--color-primary)", r: 16, label: true },
  leader: { fill: "var(--color-chart-2, #10b981)", r: 11, label: true },
  member: { fill: "var(--color-muted-foreground)", r: 6, label: false },
  unassigned: { fill: "#9ca3af", r: 6, label: false },
};

const WIDTH = 900;
const HEIGHT = 600;

export function CellGraph({
  nodes: input,
  links: inputLinks,
  onSelect,
  selectedId,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}) {
  // Only connected people belong on the network canvas (unassigned show in the panel).
  const connected = useMemo(
    () => input.filter((n) => n.tier !== "unassigned"),
    [input],
  );

  const nodesRef = useRef<SimNode[]>([]);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const [, force] = useState(0); // re-render on tick
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ id: string } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const didPan = useRef(false);

  // Build sim nodes once per data identity.
  useEffect(() => {
    const nodeById = new Map(nodesRef.current.map((n) => [n.id, n]));
    nodesRef.current = connected.map((n, i) => {
      const prev = nodeById.get(n.id);
      return {
        ...n,
        x: prev?.x ?? WIDTH / 2 + Math.cos(i) * 120,
        y: prev?.y ?? HEIGHT / 2 + Math.sin(i) * 120,
      };
    });

    const idset = new Set(connected.map((n) => n.id));
    const links = inputLinks
      .filter((l) => idset.has(l.source) && idset.has(l.target))
      .map((l) => ({ ...l }));

    const sim = forceSimulation<SimNode>(nodesRef.current)
      .force(
        "link",
        forceLink<SimNode, (typeof links)[number]>(links)
          .id((d) => d.id)
          .distance(70)
          .strength(0.6),
      )
      .force("charge", forceManyBody().strength(-260))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide<SimNode>((d) => TIER_STYLE[d.tier].r + 6))
      .on("tick", () => force((t) => t + 1));

    simRef.current = sim;
    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, inputLinks]);

  // Highlight the selected node's ancestors + descendants; dim the rest.
  const highlighted = useMemo(() => {
    if (!selectedId) return null;
    const parentOf = new Map(inputLinks.map((l) => [l.source, l.target]));
    const childrenOf = new Map<string, string[]>();
    for (const l of inputLinks) {
      const arr = childrenOf.get(l.target) ?? [];
      arr.push(l.source);
      childrenOf.set(l.target, arr);
    }
    const set = new Set<string>([selectedId]);
    let up: string | undefined = parentOf.get(selectedId);
    while (up && !set.has(up)) {
      set.add(up);
      up = parentOf.get(up);
    }
    const stack = [selectedId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const kid of childrenOf.get(id) ?? []) {
        if (!set.has(kid)) {
          set.add(kid);
          stack.push(kid);
        }
      }
    }
    return set;
  }, [selectedId, inputLinks]);

  const dim = (id: string) => (highlighted && !highlighted.has(id) ? 0.15 : 1);

  const nodePos = new Map(nodesRef.current.map((n) => [n.id, n]));

  function pointerToWorld(e: React.PointerEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const py = ((e.clientY - rect.top) / rect.height) * HEIGHT;
    return { x: (px - view.x) / view.k, y: (py - view.y) / view.k };
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-[60vh] w-full touch-none rounded-lg border bg-card"
      onWheel={(e) => {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        setView((v) => ({ ...v, k: Math.min(3, Math.max(0.4, v.k * factor)) }));
      }}
      onPointerDown={(e) => {
        // Background press → begin panning. Node presses stopPropagation, so
        // they never reach here.
        pan.current = {
          sx: e.clientX,
          sy: e.clientY,
          vx: view.x,
          vy: view.y,
          moved: false,
        };
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current) {
          const w = pointerToWorld(e);
          const n = nodePos.get(drag.current.id);
          if (n) {
            n.fx = w.x;
            n.fy = w.y;
            simRef.current?.alphaTarget(0.3).restart();
          }
          return;
        }
        if (pan.current) {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const dxPx = e.clientX - pan.current.sx;
          const dyPx = e.clientY - pan.current.sy;
          if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) pan.current.moved = true;
          const dx = (dxPx / rect.width) * WIDTH;
          const dy = (dyPx / rect.height) * HEIGHT;
          setView((v) => ({ ...v, x: pan.current!.vx + dx, y: pan.current!.vy + dy }));
        }
      }}
      onPointerUp={(e) => {
        drag.current = null;
        simRef.current?.alphaTarget(0);
        didPan.current = Boolean(pan.current?.moved);
        pan.current = null;
        try {
          (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
        } catch {}
      }}
      onClick={() => {
        // Suppress the deselect that would otherwise follow a pan drag.
        if (didPan.current) {
          didPan.current = false;
          return;
        }
        onSelect(null);
      }}
    >
      <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
        {inputLinks.map((l, i) => {
          const s = nodePos.get(l.source);
          const t = nodePos.get(l.target);
          if (!s || !t) return null;
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="var(--color-border)"
              strokeWidth={1}
              opacity={Math.min(dim(l.source), dim(l.target))}
            />
          );
        })}
        {nodesRef.current.map((n) => {
          const st = TIER_STYLE[n.tier];
          const selected = n.id === selectedId;
          const hovered = n.id === hoveredId;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              opacity={dim(n.id)}
              className="cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation();
                drag.current = { id: n.id };
                (e.target as SVGElement).ownerSVGElement?.setPointerCapture(
                  e.pointerId,
                );
              }}
              onPointerEnter={() => setHoveredId(n.id)}
              onPointerLeave={() =>
                setHoveredId((h) => (h === n.id ? null : h))
              }
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n.id);
              }}
            >
              <circle
                r={st.r + (selected ? 3 : 0)}
                fill={st.fill}
                stroke={selected ? "var(--color-ring)" : "var(--color-background)"}
                strokeWidth={selected ? 3 : 1.5}
              />
              {st.label || selected || hovered ? (
                <text
                  x={st.r + 4}
                  y={4}
                  className="pointer-events-none fill-foreground text-[11px]"
                >
                  {n.name}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
