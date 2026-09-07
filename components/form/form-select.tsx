"use client";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectOption = { value: string; label: string };

/**
 * Base UI Select wired for native form submission. The `name` prop makes the
 * value part of FormData; `items` lets the trigger render the label instead of
 * the raw value.
 *
 * `placeholder` only shows while nothing is selected — it is not selectable, so
 * an optional field also needs `clearLabel` to prepend a real "none" item.
 * Without it a value can be set but never unset. The empty string it submits is
 * what `emptyToNull` in lib/validators.ts turns back into a NULL column.
 *
 * The two ARIA props are forwarded to the trigger because `Field` clones them
 * onto whatever it wraps. Since this component takes a fixed prop list rather
 * than spreading the rest, dropping them here would silently break the contract
 * for every select in a form — no description, and no error ring, because
 * `SelectTrigger` styles that off `aria-invalid`.
 */
export function FormSelect({
  name,
  defaultValue,
  placeholder,
  options,
  required,
  id,
  className,
  onValueChange,
  clearLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  options: SelectOption[];
  required?: boolean;
  id?: string;
  className?: string;
  onValueChange?: (value: string) => void;
  clearLabel?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const items = clearLabel
    ? [{ value: "", label: clearLabel }, ...options]
    : options;

  return (
    <Select
      name={name}
      defaultValue={defaultValue ?? undefined}
      items={items}
      required={required}
      onValueChange={(value) => onValueChange?.(value as string)}
    >
      <SelectTrigger
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={cn("w-full", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
