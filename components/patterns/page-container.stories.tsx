import * as React from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Plus, Users } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackLink } from "./back-link";
import { InfoTile } from "./info-tile";
import { PageContainer } from "./page-container";
import { PageHeader } from "./page-header";

/** The layout's `<main>` padding, so each story sits where a real page does. */
function Main({ children }: { children: React.ReactNode }) {
  return <main className="p-4 md:p-6">{children}</main>;
}

function ListBody() {
  return (
    <>
      <PageHeader
        title="Services"
        description="Recurring schedules and individual services you track attendance for."
      >
        <Link href="/services/new" className={cn(buttonVariants())}>
          <Plus className="size-4" />
          Add Service
        </Link>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>All Services</CardTitle>
        </CardHeader>
        <CardContent className="h-24" />
      </Card>
    </>
  );
}

function RecordBody() {
  return (
    <>
      <BackLink href="/services" label="Back to services" />
      <PageHeader title="Sunday Worship Service" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <InfoTile label="When" value="20 Sep 2026, 7:30 AM" icon={CalendarDays} />
        <InfoTile label="Location" value="Socorro" icon={MapPin} />
        <InfoTile label="Total Attendance" value={0} icon={Users} accent numeric />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Attendees</CardTitle>
        </CardHeader>
        <CardContent className="h-24" />
      </Card>
    </>
  );
}

function FormBody() {
  return (
    <>
      <BackLink href="/services" label="Back to services" />
      <PageHeader
        title="Add Service"
        description="A one-off service. Use a schedule for services that repeat."
      />
      <Card>
        <CardContent className="space-y-2">
          <Label htmlFor="story-service-name">Name</Label>
          <Input id="story-service-name" defaultValue="Sunday Worship Service" />
        </CardContent>
      </Card>
    </>
  );
}

const meta = {
  title: "Patterns/PageContainer",
  component: PageContainer,
  parameters: { layout: "fullscreen" },
  args: { width: "full" },
  argTypes: {
    width: { control: "inline-radio", options: ["full", "form"] },
  },
  render: (args) => (
    <Main>
      <PageContainer {...args}>
        <RecordBody />
      </PageContainer>
    </Main>
  ),
} satisfies Meta<typeof PageContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A list page: the table fills the width the layout gives it. */
export const List: Story = {
  render: (args) => (
    <Main>
      <PageContainer {...args}>
        <ListBody />
      </PageContainer>
    </Main>
  ),
};

/**
 * A record opened from a list keeps the list's width, so clicking a row does
 * not narrow the page or push the title inwards.
 */
export const Record: Story = {};

/**
 * Create and edit screens cap their line length but stay left-aligned: the
 * title and back link sit exactly where the list's title was.
 */
export const Form: Story = {
  args: { width: "form" },
  render: (args) => (
    <Main>
      <PageContainer {...args}>
        <FormBody />
      </PageContainer>
    </Main>
  ),
};

/**
 * All three stacked, as a navigation list → record → form would show them.
 * Every title starts on the same vertical line; only the form's right edge
 * moves in.
 */
export const SharedLeftEdge: Story = {
  render: () => (
    <Main>
      <div className="space-y-10">
        <PageContainer>
          <ListBody />
        </PageContainer>
        <PageContainer>
          <RecordBody />
        </PageContainer>
        <PageContainer width="form">
          <FormBody />
        </PageContainer>
      </div>
    </Main>
  ),
};
