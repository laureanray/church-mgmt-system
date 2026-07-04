import { describe, expect, it } from "vitest";
import { cellGroupSchema } from "./validators";

describe("cellGroupSchema", () => {
  it("requires a name", () => {
    expect(cellGroupSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts a minimal valid cell group and defaults active to true", () => {
    const r = cellGroupSchema.safeParse({ name: "Ana's Cell" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.active).toBe(true);
      expect(r.data.leaderId).toBeNull();
      expect(r.data.parentCellGroupId).toBeNull();
      expect(r.data.meetingDay).toBeNull();
    }
  });

  it("coerces empty optional fields to null and parses meeting fields", () => {
    const r = cellGroupSchema.safeParse({
      name: "Youth",
      leaderId: "",
      meetingDay: "3",
      meetingTime: "19:00",
      meetingLocation: "Room 2",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.meetingDay).toBe(3);
      expect(r.data.meetingTime).toBe("19:00");
      expect(r.data.leaderId).toBeNull();
    }
  });

  it("rejects a bad meeting time", () => {
    const r = cellGroupSchema.safeParse({ name: "X", meetingTime: "7pm" });
    expect(r.success).toBe(false);
  });
});
