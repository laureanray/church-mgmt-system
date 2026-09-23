import { describe, expect, it } from "bun:test";
import {
  cellGroupSchema,
  createUserSchema,
  lineupAssignmentSchema,
  ministrySchema,
  promoteSchema,
  roleSchema,
  songSchema,
} from "./validators";

describe("roleSchema", () => {
  it("accepts catalog permissions and removes duplicates", () => {
    expect(
      roleSchema.parse({
        name: "Coordinator",
        description: "",
        permissions: ["members.view", "members.view", "members.update"],
      }),
    ).toEqual({
      name: "Coordinator",
      description: null,
      permissions: ["members.view", "members.update"],
    });
  });

  it("rejects permission keys that are not in the deployed catalog", () => {
    expect(
      roleSchema.safeParse({
        name: "Coordinator",
        permissions: ["members.publish"],
      }).success,
    ).toBe(false);
  });
});

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

import { MEMBER_STATUSES } from "./constants";

describe("member status", () => {
  it("accepts every lifecycle status", () => {
    for (const status of MEMBER_STATUSES) {
      expect(memberSchema.parse({ ...memberInput, status }).status).toBe(status);
    }
  });

  it("defaults a missing or blank status to active", () => {
    for (const status of [undefined, null, "", "  "]) {
      expect(memberSchema.parse({ ...memberInput, status }).status).toBe("active");
    }
  });

  it("rejects a status outside the enum and reports it on the field", () => {
    for (const status of ["archived", "Active", "married"]) {
      const result = memberSchema.safeParse({ ...memberInput, status });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(fieldErrors(result.error)).toEqual({ status: "Choose a valid status" });
      }
    }
  });
});

describe("member input from JSON", () => {
  it("treats an omitted optional field like an empty form field", () => {
    // FormData reports a missing field as null; a JSON body just leaves it out.
    const result = memberSchema.parse({ firstName: "Ana", lastName: "Santos" });
    expect(result).toMatchObject({
      fullName: "Ana Santos",
      birthdate: null,
      memberSinceYear: null,
      gender: null,
      contactNumber: null,
      cellGroupId: null,
      status: "active",
    });
  });

  it("accepts a JSON number for the member-since year", () => {
    expect(
      memberSchema.parse({ firstName: "Ana", lastName: "Santos", memberSinceYear: 2019 })
        .memberSinceYear,
    ).toBe(2019);
  });
});

describe("ministrySchema", () => {
  it("accepts grantable permissions and reads the active checkbox", () => {
    expect(
      ministrySchema.parse({
        name: "LAM",
        description: "",
        active: "on",
        permissions: ["lam.view", "lam.view", "services.view"],
      }),
    ).toEqual({
      name: "LAM",
      description: null,
      active: true,
      permissions: ["lam.view", "services.view"],
    });
  });

  it("treats an unticked active checkbox as inactive", () => {
    // FormData.get returns null for an unticked checkbox.
    expect(
      ministrySchema.parse({ name: "LAM", description: null, active: null }).active,
    ).toBe(false);
  });

  it("rejects a permission a ministry may not grant", () => {
    for (const key of ["users.update", "roles.update", "ministries.update", "settings.update"]) {
      expect(
        ministrySchema.safeParse({
        name: "LAM",
        description: null,
        active: "on",
        permissions: [key],
      }).success,
      ).toBe(false);
    }
  });
});

describe("songSchema", () => {
  // What the song form posts when only the title is filled in.
  const blank = {
    artist: null,
    defaultKey: null,
    tempo: null,
    referenceUrl: null,
    notes: null,
  };

  it("normalises empty optional fields to null", () => {
    expect(
      songSchema.parse({
        title: " Way Maker ",
        artist: "",
        defaultKey: "",
        tempo: "",
        referenceUrl: "",
        notes: "",
      }),
    ).toEqual({
      title: "Way Maker",
      artist: null,
      defaultKey: null,
      tempo: null,
      referenceUrl: null,
      notes: null,
    });
  });

  it("parses tempo and accepts a web link", () => {
    const song = songSchema.parse({
      ...blank,
      title: "Way Maker",
      tempo: "68",
      referenceUrl: "https://example.com/chords",
    });
    expect(song.tempo).toBe(68);
    expect(song.referenceUrl).toBe("https://example.com/chords");
  });

  it("rejects a non-web link and an implausible tempo", () => {
    expect(
      songSchema.safeParse({ ...blank, title: "X", referenceUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      songSchema.safeParse({ ...blank, title: "X", tempo: "1000" }).success,
    ).toBe(false);
    expect(songSchema.safeParse({ ...blank, title: "X" }).success).toBe(true);
  });
});

describe("lineupAssignmentSchema", () => {
  it("accepts only known parts", () => {
    expect(
      lineupAssignmentSchema.safeParse({ memberId: "m", part: "keys" }).success,
    ).toBe(true);
    expect(
      lineupAssignmentSchema.safeParse({ memberId: "m", part: "kazoo" }).success,
    ).toBe(false);
  });
});

describe("createUserSchema", () => {
  it("treats an empty linked member as not linked", () => {
    expect(
      createUserSchema.parse({
        name: "Joy",
        email: "joy@example.com",
        roleId: "usher",
        memberId: "",
      }).memberId,
    ).toBeNull();
  });
});
