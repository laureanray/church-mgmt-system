import { cn } from "@/lib/utils";

/**
 * A label/value description list — the body of a record's detail card.
 *
 * `DetailRow` renders an em dash for any empty value, so callers can pass a
 * nullable column straight through. That means a *falsy but real* value needs
 * care: pass `String(0)`, not `0`, or the zero disappears behind the dash.
 */
export function DetailList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <dl className={cn("divide-y", className)}>{children}</dl>;
}

export function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm">{value || "—"}</dd>
    </div>
  );
}
