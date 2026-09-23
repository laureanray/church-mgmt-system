import { describe, expect, it } from "bun:test";

import {
  DEFAULT_DIRECTORY_STATUSES,
  LAPSED_STATUSES,
  MEMBER_STATUSES,
  MEMBER_STATUS_LABELS,
  PASTORAL_STATUSES,
  isLapsed,
} from "./constants";
import { members } from "@/db/schema";

describe("member statuses", () => {
  it("match the column's enum, in order", () => {
    expect([...MEMBER_STATUSES]).toEqual([...members.status.enumValues]);
  });

  it("label every status", () => {
    expect(Object.keys(MEMBER_STATUS_LABELS)).toEqual([...MEMBER_STATUSES]);
  });

  it("open the directory on the people who attend", () => {
    expect(DEFAULT_DIRECTORY_STATUSES).toEqual(["active", "visitor"]);
  });

  it("keep transferred and deceased members out of celebrations and absentee reports", () => {
    expect(PASTORAL_STATUSES).not.toContain("transferred");
    expect(PASTORAL_STATUSES).not.toContain("deceased");
    expect(PASTORAL_STATUSES).toEqual(["active", "visitor", "inactive"]);
  });

  it("offer reactivation only to members who had stopped attending", () => {
    expect(MEMBER_STATUSES.filter(isLapsed)).toEqual(LAPSED_STATUSES);
    expect(isLapsed("active")).toBe(false);
    expect(isLapsed("visitor")).toBe(false);
    expect(isLapsed("inactive")).toBe(true);
  });
});
