"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateFromIso, dateInputIso, dateInputText, dateToIso } from "@/lib/date-input";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  id: string;
  name: string;
  defaultValue?: string | null;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** Stable clock for stories; production defaults to the current date. */
  today?: Date;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/** Editable date with a calendar; submits the date-only ISO value via FormData. */
export function DatePicker({ id, name, defaultValue, disabled, required, className, today = new Date(), "aria-describedby": describedBy, "aria-invalid": invalid }: DatePickerProps) {
  const [text, setText] = React.useState(() => dateInputText(defaultValue ?? ""));
  const [open, setOpen] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const iso = dateInputIso(text);
  const selected = iso ? dateFromIso(iso) : undefined;
  const invalidText = Boolean(text.trim() && !iso);
  const errorId = `${id}-format-error`;
  const formatId = `${id}-format`;

  React.useEffect(() => {
    input.current?.setCustomValidity(invalidText ? "Enter a valid date as DD/MM/YYYY." : "");
  }, [invalidText]);
  React.useEffect(() => {
    const form = input.current?.form;
    const reset = () => { setText(dateInputText(defaultValue ?? "")); setTouched(false); setOpen(false); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue]);

  function choose(date?: Date) {
    setText(date ? dateInputText(dateToIso(date)) : "");
    setTouched(false);
    setOpen(false);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <input type="hidden" name={name} value={iso ?? text} disabled={disabled} />
      <Popover.Root open={open} onOpenChange={setOpen}>
        <div className="relative">
          <Input ref={input} id={id} value={text} disabled={disabled} required={required}
            placeholder="DD/MM/YYYY" autoComplete="off" className="pr-10"
            aria-describedby={[describedBy, formatId, touched && invalidText ? errorId : ""].filter(Boolean).join(" ")}
            aria-invalid={invalid || (touched && invalidText) || undefined}
            onChange={(event) => setText(event.target.value)} onBlur={() => setTouched(true)} />
          <Popover.Trigger render={<Button type="button" variant="ghost" size="icon-sm" />} disabled={disabled}
            aria-label={`Choose date for ${name.replace(/([A-Z])/g, " $1").toLowerCase()}`}
            className="absolute right-0.5 top-0.5 text-muted-foreground">
            <CalendarDays aria-hidden />
          </Popover.Trigger>
        </div>
        <Popover.Portal>
          <Popover.Positioner sideOffset={6} align="end" className="z-50">
            <Popover.Popup className="max-w-[calc(100vw-2rem)] rounded-lg border bg-popover text-popover-foreground shadow-md outline-none" finalFocus={input}>
              <Popover.Title className="sr-only">Choose a date</Popover.Title>
              <Calendar mode="single" selected={selected} defaultMonth={selected ?? today} today={today}
                startMonth={new Date(Math.min(1900, selected?.getFullYear() ?? 1900), 0)}
                endMonth={new Date(Math.max(today.getFullYear() + 10, selected?.getFullYear() ?? 0), 11)}
                onSelect={choose} />
              <div className="flex items-center justify-between border-t px-3 py-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => choose(today)}>Today</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => choose()}>Clear</Button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <span id={formatId} className="sr-only">Day, month, year. DD/MM/YYYY.</span>
      {touched && invalidText ? <p id={errorId} role="alert" className="text-xs font-medium text-destructive">Enter a valid date as DD/MM/YYYY.</p> : null}
    </div>
  );
}
