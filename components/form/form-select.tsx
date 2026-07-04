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
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  options: SelectOption[];
  required?: boolean;
  id?: string;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Select
      name={name}
      defaultValue={defaultValue ?? undefined}
      items={options}
      required={required}
      onValueChange={(value) => onValueChange?.(value as string)}
    >
      <SelectTrigger id={id} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
