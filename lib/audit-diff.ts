// Pure helpers behind the audit log: turn rows into JSON snapshots, keep only
// what changed, and strip secrets. lib/audit.ts writes the result; nothing here
// touches the database, so it is covered by the unit suite.

export type AuditValue =
  | string
  | number
  | boolean
  | null
  | AuditValue[]
  | { [key: string]: AuditValue };

export type AuditSnapshot = Record<string, AuditValue>;

export type AuditChanges = {
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
};

/** Stored in place of a secret, so a log still shows *that* it changed. */
export const REDACTED = "[redacted]";

// Bookkeeping columns: every update moves `updatedAt`, which would make every
// entry look like a change to it and bury the field that actually moved.
const IGNORED_FIELDS = new Set(["createdAt", "updatedAt"]);

// Webhook secrets, passwords and tokens never reach the log, whatever table
// they arrive from. Matched on the key so a new column is covered by its name.
const SECRET_FIELD = /secret|password|token/i;

function toAuditValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toAuditValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toAuditValue(v)]),
    );
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

/** A row as JSON: dates as ISO strings, bookkeeping columns dropped. */
export function snapshot(record: Record<string, unknown>): AuditSnapshot {
  const out: AuditSnapshot = {};
  for (const [key, value] of Object.entries(record)) {
    if (IGNORED_FIELDS.has(key)) continue;
    out[key] = toAuditValue(value);
  }
  return out;
}

const same = (a: AuditValue | undefined, b: AuditValue | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What to store for a mutation. A create keeps the whole new row and a delete
 * the whole old one; an update keeps only the fields that moved, on both sides.
 * Returns null for an update that changed nothing, which is not worth an entry.
 */
export function auditChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AuditChanges | null {
  const old = before ? snapshot(before) : null;
  const next = after ? snapshot(after) : null;
  if (!old || !next) return { before: old, after: next };

  const changedBefore: AuditSnapshot = {};
  const changedAfter: AuditSnapshot = {};
  for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
    if (same(old[key], next[key])) continue;
    changedBefore[key] = old[key] ?? null;
    changedAfter[key] = next[key] ?? null;
  }
  if (Object.keys(changedAfter).length === 0) return null;
  return { before: changedBefore, after: changedAfter };
}

/**
 * Replace every secret-looking value with a marker. A null stays null, so the
 * log can still say a secret was set or cleared without saying what it was.
 */
export function redact(values: AuditSnapshot | null): AuditSnapshot | null {
  if (!values) return null;
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      SECRET_FIELD.test(key) && value !== null ? REDACTED : value,
    ]),
  );
}

/** The fields an entry touched, in the order the row lists them. */
export function changedFields(changes: AuditChanges): string[] {
  return Object.keys(changes.after ?? changes.before ?? {});
}

/** `contactNumber` → "Contact number". */
export function humanizeField(field: string): string {
  const words = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A stored value as one line of text for the log's tables. */
export function formatAuditValue(value: AuditValue | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.length ? value.map(formatAuditValue).join(", ") : "—";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * The oldest instant an entry is kept for. Calendar months, not 30-day blocks,
 * so "24 months" means the same day two years back.
 */
export function retentionCutoff(now: Date, months: number): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

/** "contact number, status" — the tail of an update's summary. */
export function describeFields(fields: string[]): string {
  return fields.map((field) => humanizeField(field).toLowerCase()).join(", ");
}
