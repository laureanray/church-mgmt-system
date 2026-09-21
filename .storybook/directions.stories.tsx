import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Users, ScanLine, CalendarDays, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { StatCard } from "@/components/patterns/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { DataTable } from "@/components/patterns/data-table";
import { tableContext } from "@/lib/data-table";
import "./directions.css";

const directions = {
  clear: { title: "Clear", detail: "Manrope · Indigo · Precise", note: "Compact, practical, and quietly confident." },
  warm: { title: "Warm", detail: "Lora + DM Sans · Forest · Soft", note: "A welcoming, editorial feel with warmer surfaces." },
  calm: { title: "Calm", detail: "DM Sans · Teal · Open", note: "An airy, understated workspace for everyday ministry." },
};
type Direction = keyof typeof directions;

function Preview({ direction }: { direction: Direction }) {
  const [checkedIn, setCheckedIn] = React.useState(false);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const choice = directions[direction];
  return (
    <section data-direction={direction} className="direction min-w-0 rounded-xl border p-5 sm:p-7">
      <div className="mb-8 flex items-center justify-between gap-3 border-b pb-4">
        <span className="text-sm font-bold tracking-wide">IRM MINISTRIES</span>
        <Badge variant="brand">{choice.title}</Badge>
      </div>
      <p className="text-xs font-medium uppercase tracking-widest text-primary">Together in faith</p>
      <h2 className="mt-3 text-3xl leading-tight font-semibold tracking-tight">A place for everyone.</h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Welcome your community, care for each member, and make Sunday feel a little simpler.</p>
      <div className={`my-6 grid gap-3 ${direction === "calm" ? "py-3" : ""}`}>
        <StatCard label="Members in our care" value="248" icon={Users} accent />
        <StatCard label="Checked in today" value={checkedIn ? "133" : "132"} icon={ScanLine} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sunday worship</CardTitle>
          <CardAction><CalendarDays aria-hidden className="size-4 text-primary" /></CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">27 Sep 2026 · 9:00 AM</p>
          <div className="flex flex-wrap gap-2"><Badge variant="success">Ongoing</Badge><Badge variant="secondary">Main sanctuary</Badge></div>
          <Button className="w-full" onClick={() => setCheckedIn((v) => !v)}>
            {checkedIn ? <Check aria-hidden /> : <ScanLine aria-hidden />}
            {checkedIn ? "Checked in · Undo" : "Try a check-in"}
          </Button>
          <p role="status" className="min-h-5 text-xs text-muted-foreground">{checkedIn ? "Ana Reyes is checked in. Sample data only." : "A sample interaction — no records are saved."}</p>
        </CardContent>
      </Card>
      <form className="mt-6 space-y-3" onSubmit={(event) => { event.preventDefault(); setError(name.trim() ? "" : "Enter a member name."); }}>
        <Field label="Member name" htmlFor={`name-${direction}`} error={error}>
          <Input id={`name-${direction}`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Juan dela Cruz" />
        </Field>
        <Button type="submit" variant="outline" className="w-full">Preview validation</Button>
      </form>
      <div className="mt-8 border-t pt-4">
        <p className="text-sm font-semibold">{choice.detail}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{choice.note}</p>
      </div>
    </section>
  );
}

const meta = {
  title: "Foundations/Design Directions",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Same content and components; compare typography, palette, and shape in either toolbar theme. */
export const Compare: Story = {
  render: () => (
    <main className="mx-auto max-w-screen-2xl p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Find the right feeling for IRM.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Three directions, one sample screen. Try the controls and switch between light and dark in the toolbar.</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-3">{(Object.keys(directions) as Direction[]).map((direction) => <Preview key={direction} direction={direction} />)}</div>
    </main>
  ),
};
export const Clear: Story = { render: () => <div className="mx-auto max-w-lg p-4"><Preview direction="clear" /></div> };
export const Warm: Story = { render: () => <div className="mx-auto max-w-lg p-4"><Preview direction="warm" /></div> };
export const Calm: Story = { render: () => <div className="mx-auto max-w-lg p-4"><Preview direction="calm" /></div> };


const registerMembers = [
  { id: "001", name: "Ana Reyes", group: "San Isidro", time: "8:42 AM" },
  { id: "002", name: "Benjamin Cruz", group: "Bagong Pag-asa", time: "8:46 AM" },
  { id: "003", name: "Carla Dizon", group: "San Isidro", time: "8:48 AM" },
  { id: "004", name: "Dennis Santos", group: "Poblacion", time: null },
  { id: "005", name: "Elena Villanueva", group: "Bagong Pag-asa", time: null },
  { id: "006", name: "Francis Mendoza", group: "Poblacion", time: null },
];

function RegisterWorkspace() {
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState("all");
  const [arrivals, setArrivals] = React.useState<Record<string, string>>({});
  const [notice, setNotice] = React.useState("");
  const rows = registerMembers.map((member) => ({ ...member, time: arrivals[member.id] ?? member.time }));
  const present = rows.filter((row) => row.time).length;
  const filtered = rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()) && (scope === "all" || !row.time));
  return (
    <main data-direction="register" className="direction min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4 md:px-10">
        <div className="flex items-baseline gap-4"><span className="text-xl font-semibold tracking-tight text-primary">IRM</span><span className="text-sm">Ministries / Attendance</span></div>
        <span className="text-xs text-muted-foreground">Design study · Sample records</span>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-9 md:px-10 md:py-14">
        <div className="grid gap-7 border-b pb-8 md:grid-cols-[1fr_auto]">
          <div><p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Sunday, 27 September 2026</p><h1 className="text-4xl font-medium tracking-tight">Sunday worship</h1><p className="mt-3 text-sm text-muted-foreground">9:00 AM – 11:00 AM <span className="mx-2">/</span> Main sanctuary</p></div>
          <dl className="flex items-end gap-10">
            <div><dt className="text-xs text-muted-foreground">Checked in</dt><dd className="mt-1 text-4xl font-medium tabular-nums">{present.toString().padStart(2, "0")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Expected</dt><dd className="mt-1 text-4xl font-medium tabular-nums text-muted-foreground">06</dd></div>
          </dl>
        </div>
        <div className="grid gap-8 pt-8 lg:grid-cols-[1fr_220px] lg:gap-12">
          <section aria-label="Attendance register" className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-5" aria-label="Show members">
                {[["all", "All members"], ["waiting", "Not yet arrived"]].map(([value, label]) => <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)} className={`border-b-2 pb-2 text-sm ${scope === value ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground"}`}>{label}</button>)}
              </div>
              <Input aria-label="Find a member" placeholder="Find a member…" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full sm:w-56" />
            </div>
            <DataTable
              ctx={tableContext("/attendance-preview", {})}
              caption="Sunday worship attendance"
              rows={filtered}
              rowKey={(row) => row.id}
              columnVisibility={false}
              framed={false}
              columns={[
                { id: "name", header: "Member", cell: (row) => <span className="font-medium">{row.name}</span> },
                { id: "group", header: "Cell group", hideBelow: "sm", cell: (row) => <span className="text-muted-foreground">{row.group}</span> },
                { id: "arrival", header: "Arrival", align: "end", cell: (row) => row.time ? <span className="text-sm tabular-nums">{row.time}</span> : <Button size="sm" variant="outline" onClick={() => { setArrivals((previous) => ({ ...previous, [row.id]: "9:02 AM" })); setNotice(`${row.name} checked in at 9:02 AM.`); }}>Check in<span className="sr-only"> {row.name}</span></Button> },
              ]}
              empty={{ title: "No members to show" }}
              emptyFiltered={{ title: "No matching members" }}
            />
            <p role="status" className="mt-4 min-h-5 text-sm text-primary">{notice}</p>
            <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">Showing {filtered.length} of 6 members</p>
          </section>
          <aside className="border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <h2 className="text-sm font-semibold">At the welcome desk</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Find the member’s name, then select Check in. Their arrival time appears in the register.</p>
            <h3 className="mt-7 text-xs font-medium uppercase tracking-wider">Service notes</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Children’s ministry meets in Room 2 after worship.</p>
            <button type="button" onClick={() => { setArrivals({}); setNotice(""); setQuery(""); setScope("all"); }} className="mt-8 text-xs text-muted-foreground underline underline-offset-4">Reset sample attendance</button>
          </aside>
        </div>
      </div>
    </main>
  );
}

/** A working register: typography and rules establish hierarchy, with color reserved for actions. */
export const Register: Story = { render: () => <RegisterWorkspace /> };
