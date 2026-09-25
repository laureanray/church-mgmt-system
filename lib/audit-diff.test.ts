import { describe, expect, test } from "bun:test";

import {
  REDACTED,
  auditChanges,
  changedFields,
  describeFields,
  formatAuditValue,
  humanizeField,
  redact,
  retentionCutoff,
  snapshot,
} from "./audit-diff";

describe("snapshot", () => {
  test("serialises dates and drops bookkeeping columns", () => {
    const at = new Date("2026-09-01T02:00:00.000Z");
    expect(
      snapshot({ name: "Ana", checkedInAt: at, updatedAt: at, createdAt: at, x: undefined }),
    ).toEqual({ name: "Ana", checkedInAt: "2026-09-01T02:00:00.000Z", x: null });
  });
});

describe("auditChanges", () => {
  const member = {
    id: "m1",
    fullName: "Ana Santos",
    contactNumber: "0917 000 0000",
    status: "active",
    updatedAt: new Date("2026-01-01"),
  };

  test("keeps only the field that changed on an update", () => {
    const changes = auditChanges(member, {
      ...member,
      contactNumber: "0918 111 1111",
      updatedAt: new Date("2026-02-01"),
    });
    expect(changes).toEqual({
      before: { contactNumber: "0917 000 0000" },
      after: { contactNumber: "0918 111 1111" },
    });
  });

  test("returns null when an update changed nothing", () => {
    expect(auditChanges(member, { ...member, updatedAt: new Date() })).toBeNull();
  });

  test("keeps the whole row on a create or a delete", () => {
    expect(auditChanges(null, member)?.before).toBeNull();
    expect(auditChanges(null, member)?.after?.fullName).toBe("Ana Santos");
    expect(auditChanges(member, null)?.after).toBeNull();
    expect(auditChanges(member, null)?.before?.id).toBe("m1");
  });

  test("compares arrays by value", () => {
    expect(auditChanges({ permissions: ["a", "b"] }, { permissions: ["a", "b"] })).toBeNull();
    expect(
      auditChanges({ permissions: ["a"] }, { permissions: ["a", "b"] })?.after,
    ).toEqual({ permissions: ["a", "b"] });
  });
});

describe("redact", () => {
  test("hides secrets, passwords and tokens but keeps nulls", () => {
    expect(
      redact({
        sheetsWebhookUrl: "https://example.test",
        sheetsWebhookSecret: "abc123",
        password: "hunter2",
        qrToken: "tok",
        cleared: null,
        tempPassword: null,
      }),
    ).toEqual({
      sheetsWebhookUrl: "https://example.test",
      sheetsWebhookSecret: REDACTED,
      password: REDACTED,
      qrToken: REDACTED,
      cleared: null,
      tempPassword: null,
    });
  });

  test("passes null through", () => {
    expect(redact(null)).toBeNull();
  });
});

describe("display helpers", () => {
  test("lists the fields an entry touched", () => {
    expect(changedFields({ before: null, after: { a: 1, b: 2 } })).toEqual(["a", "b"]);
    expect(changedFields({ before: { c: 1 }, after: null })).toEqual(["c"]);
  });

  test("humanizes camel and snake case", () => {
    expect(humanizeField("contactNumber")).toBe("Contact number");
    expect(humanizeField("cell_group_id")).toBe("Cell group id");
  });

  test("describes the changed fields for a summary", () => {
    expect(describeFields(["contactNumber", "status"])).toBe("contact number, status");
  });

  test("formats values for a table cell", () => {
    expect(formatAuditValue(null)).toBe("—");
    expect(formatAuditValue(true)).toBe("Yes");
    expect(formatAuditValue(["a", "b"])).toBe("a, b");
    expect(formatAuditValue([])).toBe("—");
    expect(formatAuditValue(1990)).toBe("1990");
  });
});

describe("retentionCutoff", () => {
  test("counts back calendar months", () => {
    expect(
      retentionCutoff(new Date("2026-09-25T00:00:00.000Z"), 24).toISOString(),
    ).toBe("2024-09-25T00:00:00.000Z");
  });
});

describe("snapshot of nested and unusual values", () => {
  test("keeps nested objects and arrays as JSON, dates inside them included", () => {
    const at = new Date("2026-09-01T02:00:00.000Z");
    expect(snapshot({ meta: { at, tags: ["a", 1, true, null] } })).toEqual({
      meta: { at: "2026-09-01T02:00:00.000Z", tags: ["a", 1, true, null] },
    });
  });

  test("writes anything else as its string", () => {
    expect(snapshot({ big: BigInt(12), sym: Symbol("s") })).toEqual({ big: "12", sym: "Symbol(s)" });
  });
});
