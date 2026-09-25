import {
  formatAuditValue,
  humanizeField,
  type AuditSnapshot,
} from "@/lib/audit-diff";
import { cn } from "@/lib/utils";

/**
 * What one audit entry changed, as a compact list for a table cell.
 *
 * An update stores only the fields that moved, so it reads as "old → new" per
 * field and stays short. A create or a delete stores the whole record — two
 * dozen fields for a member — so that folds behind a native `<details>`, which
 * needs no JavaScript and keeps the row one line tall until someone asks.
 */
export function AuditChanges({
  before,
  after,
  className,
}: {
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
  className?: string;
}) {
  if (before && after) {
    return (
      <dl className={cn("space-y-0.5 text-sm", className)}>
        {Object.keys(after).map((field) => (
          <div key={field} className="flex flex-wrap items-baseline gap-x-1.5">
            <dt className="text-muted-foreground">{humanizeField(field)}:</dt>
            <dd className="min-w-0 break-words">
              <del className="text-muted-foreground decoration-muted-foreground/60">
                {formatAuditValue(before[field])}
              </del>
              <span aria-hidden className="px-1 text-muted-foreground">
                →
              </span>
              <span className="sr-only"> changed to </span>
              <ins className="font-medium no-underline">
                {formatAuditValue(after[field])}
              </ins>
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  const record = after ?? before;
  if (!record || Object.keys(record).length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const fields = Object.entries(record).filter(([, value]) => value !== null);
  return (
    <details className={cn("group text-sm", className)}>
      <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        {after ? "New record" : "Deleted record"} · {fields.length} field
        {fields.length === 1 ? "" : "s"}
      </summary>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {fields.map(([field, value]) => (
          <div key={field} className="contents">
            <dt className="text-muted-foreground">{humanizeField(field)}</dt>
            <dd className="min-w-0 break-words">{formatAuditValue(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
