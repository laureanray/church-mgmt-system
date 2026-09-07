import { expect, it } from "bun:test";

import { selectScanServices } from "./scan-selection";

const at = (iso: string) => ({ id: iso, scheduledAt: new Date(iso) });

const now = new Date("2026-03-15T10:00:00Z").getTime();

const nearby = [
  at("2026-03-22T09:00:00Z"),
  at("2026-03-15T09:00:00Z"),
  at("2026-03-08T09:00:00Z"),
];

it("opens on the service nearest now when nothing is requested", () => {
  const { rows, initialServiceId } = selectScanServices(nearby, undefined, now);

  expect(initialServiceId).toBe("2026-03-15T09:00:00Z");
  expect(rows).toHaveLength(3);
});

it("keeps a requested service that falls outside the window", () => {
  // A /scan?service=… link from a service page two years back.
  const old = at("2024-01-07T09:00:00Z");

  const { rows, initialServiceId } = selectScanServices(nearby, old, now);

  expect(initialServiceId).toBe(old.id);
  // The camera records against initialServiceId, so it has to be listed.
  expect(rows.map((s) => s.id)).toContain(old.id);
  expect(rows).toHaveLength(4);
});

it("never selects a service missing from the list", () => {
  const old = at("2024-01-07T09:00:00Z");

  for (const requested of [undefined, old, nearby[2]]) {
    const { rows, initialServiceId } = selectScanServices(
      nearby,
      requested,
      now,
    );
    expect(rows.some((s) => s.id === initialServiceId)).toBe(true);
  }
});

it("does not duplicate a requested service already in the window", () => {
  const { rows, initialServiceId } = selectScanServices(
    nearby,
    nearby[2],
    now,
  );

  expect(rows).toHaveLength(3);
  expect(initialServiceId).toBe(nearby[2].id);
});

it("orders newest first, wherever the requested service landed", () => {
  const old = at("2024-01-07T09:00:00Z");

  const { rows } = selectScanServices(nearby, old, now);

  expect(rows.map((s) => s.id)).toEqual([
    "2026-03-22T09:00:00Z",
    "2026-03-15T09:00:00Z",
    "2026-03-08T09:00:00Z",
    "2024-01-07T09:00:00Z",
  ]);
});

it("selects nothing when there are no services at all", () => {
  expect(selectScanServices([], undefined, now)).toEqual({
    rows: [],
    initialServiceId: undefined,
  });
});
