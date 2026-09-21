import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

/**
 * Foundations: the tokens every component is built from.
 *
 * Each swatch reads the live CSS variable, so flipping the toolbar's theme
 * switch shows exactly what dark mode does to it — which is the only reliable
 * way to catch a token that was only ever checked in light mode.
 */

type Token = { name: string; utility: string; usage: string };

const SURFACES: Token[] = [
  { name: "background", utility: "bg-background", usage: "Page canvas" },
  { name: "foreground", utility: "text-foreground", usage: "Body text" },
  { name: "card", utility: "bg-card", usage: "Raised panel" },
  { name: "popover", utility: "bg-popover", usage: "Overlay surface" },
  {
    name: "muted",
    utility: "bg-muted",
    usage: "Quiet fill — icon wells, striped rows",
  },
  {
    name: "muted-foreground",
    utility: "text-muted-foreground",
    usage: "Secondary text, placeholder icons",
  },
  { name: "border", utility: "border-border", usage: "Hairlines, table rules" },
  { name: "input", utility: "border-input", usage: "Field border" },
];

const ACTIONS: Token[] = [
  {
    name: "primary",
    utility: "bg-primary",
    usage: "Filled button, active nav, brand accent",
  },
  {
    name: "secondary",
    utility: "bg-secondary",
    usage: "Second-rank button, neutral badge",
  },
  { name: "accent", utility: "bg-accent", usage: "Hover fill on menu items" },
  { name: "ring", utility: "ring-ring", usage: "Focus ring" },
];

const STATUS: Token[] = [
  {
    name: "destructive",
    utility: "text-destructive",
    usage: "Delete, validation failure",
  },
  { name: "success", utility: "text-success", usage: "Connected, checked in" },
  {
    name: "warning",
    utility: "text-warning",
    usage: "Needs attention — unassigned, must reset",
  },
  { name: "info", utility: "text-info", usage: "Neutral notice" },
];

const CHARTS: Token[] = [
  { name: "chart-1", utility: "--color-chart-1", usage: "Leader of leaders" },
  { name: "chart-2", utility: "--color-chart-2", usage: "Leader" },
  { name: "chart-3", utility: "--color-chart-3", usage: "Spare category" },
  { name: "chart-4", utility: "--color-chart-4", usage: "Spare category" },
  { name: "chart-5", utility: "--color-chart-5", usage: "Spare category" },
];

function Swatch({ name, utility, usage }: Token) {
  return (
    <div className="flex items-center gap-3">
      {/* The raw `--name`, not `--color-name`. `@theme inline` substitutes theme
          values straight into utilities instead of emitting the `--color-*`
          property, so only the handful that some file spells out literally ever
          reach the stylesheet — a swatch built on them renders blank. The raw
          properties in `:root` / `.dark` are always there. */}
      <div
        className="size-10 shrink-0 rounded-md border"
        style={{ background: `var(--${name})` }}
      />
      <div className="min-w-0">
        <code className="text-xs font-medium">{utility}</code>
        <p className="text-xs text-muted-foreground">{usage}</p>
      </div>
    </div>
  );
}

function Group({ title, tokens }: { title: string; tokens: Token[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tokens.map((t) => (
          <Swatch key={t.name} {...t} />
        ))}
      </div>
    </section>
  );
}

const meta = {
  title: "Foundations/Tokens",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

export const Color: StoryObj = {
  render: () => (
    <div className="space-y-8">
      <Group title="Surfaces & text" tokens={SURFACES} />
      <Group title="Actions" tokens={ACTIONS} />
      <Group title="Status" tokens={STATUS} />
      <Group title="Categorical (cell-group tiers)" tokens={CHARTS} />
    </div>
  ),
};

export const Typography: StoryObj = {
  render: () => (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">IBM Plex Sans · Register type system</p>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Page title — text-2xl font-semibold tracking-tight
        </h1>
        <p className="text-sm text-muted-foreground">
          Page description — text-sm text-muted-foreground
        </p>
      </div>
      <p className="text-base font-semibold">
        Card title — text-base font-semibold
      </p>
      <p className="text-sm">Body — text-sm. The default for tables and forms.</p>
      <p className="text-xs text-muted-foreground">
        Meta — text-xs text-muted-foreground. Field hints and table sub-labels.
      </p>
      <p className="text-2xl font-semibold tabular-nums">
        1,248 — figures always carry `tabular-nums` so a changing count does not
        reflow its neighbours.
      </p>
      <p className="font-mono text-sm">--font-mono, for tokens and IDs.</p>
    </div>
  ),
};

export const Radius: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-end gap-4">
      {(["sm", "md", "lg", "xl", "2xl", "3xl", "4xl"] as const).map((r) => (
        <div key={r} className="space-y-2 text-center">
          <div
            className="size-20 border bg-muted"
            style={{ borderRadius: `calc(var(--radius) * ${{ sm: 0.6, md: 0.8, lg: 1, xl: 1.4, "2xl": 1.8, "3xl": 2.2, "4xl": 2.6 }[r]})` }}
          />
          <code className="text-xs text-muted-foreground">rounded-{r}</code>
        </div>
      ))}
    </div>
  ),
};
