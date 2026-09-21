import { describe, expect, it } from "bun:test";
import { cellGroupSchema, promoteSchema } from "./validators";

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

describe("promoteSchema", () => {
  it("rejects a cell group name longer than 200 characters", () => {
    const r = promoteSchema.safeParse({
      memberId: "m1",
      name: "a".repeat(201),
      parentCellGroupId: "",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid promotion and coerces an empty parent to null", () => {
    const r = promoteSchema.safeParse({
      memberId: "m1",
      name: "New Cell",
      parentCellGroupId: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.parentCellGroupId).toBeNull();
    }
  });
});

import { memberSchema, fieldErrors } from "./validators";

const memberInput = {
  firstName: " Juan Miguel ", middleName: " Reyes ", lastName: " Dela Cruz ",
  birthdate: "", spiritualBirthday: "", memberSinceYear: "", gender: "",
  maritalStatus: "", spouseName: "", weddingAnniversary: "", contactNumber: "",
  homeAddress: "", motherName: "", fatherName: "", educationalLevel: "",
  occupation: "", cellGroupId: "",
};

describe("member names", () => {
  it("preserves compound name boundaries and composes the display name", () => {
    const result = memberSchema.parse({ ...memberInput, fullName: "Untrusted display name" });
    expect(result.firstName).toBe("Juan Miguel");
    expect(result.middleName).toBe("Reyes");
    expect(result.lastName).toBe("Dela Cruz");
    expect(result.fullName).toBe("Juan Miguel Reyes Dela Cruz");
  });

  it("accepts blank, missing and null middle names without extra spaces", () => {
    for (const middleName of ["   ", null, undefined]) {
      const result = memberSchema.parse({ ...memberInput, middleName });
      expect(result.middleName).toBeNull();
      expect(result.fullName).toBe("Juan Miguel Dela Cruz");
    }
  });

  it("requires first and last names and associates errors with their inputs", () => {
    const result = memberSchema.safeParse({ ...memberInput, firstName: " ", lastName: " " });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)).toEqual({
      firstName: "First name is required", lastName: "Last name is required",
    });
  });

  it("limits each name part to 200 characters", () => {
    for (const field of ["firstName", "middleName", "lastName"]) {
      expect(memberSchema.safeParse({ ...memberInput, [field]: "a".repeat(201) }).success).toBe(false);
    }
  });
});
