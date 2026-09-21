"use client";

import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";

/** Calendar grid, with DayPicker's keyboard navigation and the shared theme. */
export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays
      fixedWeeks
      weekStartsOn={0}
      captionLayout="dropdown"
      navLayout="after"
      className={cn("relative w-fit p-3 text-sm", className)}
      classNames={{
        months: "relative",
        month_caption: "flex h-9 items-center pr-16 mb-3",
        dropdowns: "flex items-center gap-1",
        dropdown_root: "relative flex items-center rounded-md border border-input px-2 py-1 focus-within:ring-2 focus-within:ring-ring",
        dropdown: "absolute inset-0 w-full cursor-pointer opacity-0",
        caption_label: "flex items-center gap-1 font-medium pointer-events-none",
        chevron: "size-4 fill-current",
        nav: "absolute right-0 top-0 flex gap-1",
        button_previous: "flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-30",
        button_next: "flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-30",
        month_grid: "w-full border-collapse",
        weekday: "h-8 text-xs font-normal text-muted-foreground",
        day: "p-0 text-center",
        day_button: "size-9 rounded-md tabular-nums hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground",
        today: "[&>button]:font-semibold [&>button]:underline [&>button]:underline-offset-4",
        outside: "text-muted-foreground/60",
        disabled: "opacity-30",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
