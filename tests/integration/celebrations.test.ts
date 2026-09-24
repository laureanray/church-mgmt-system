import { afterAll, beforeEach, expect, it, mock } from "bun:test";
import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { cellGroups, members } from "../../db/schema";
import { celebrationWindow } from "../../lib/celebrations";

const database = connectTestDatabase();
// Registered before the import: bun's mock.module is not hoisted.
await mock.module("@/db", () => ({ db: database.db }));
const { celebrationsIn } = await import("../../lib/celebrations-query");

let token = 0;
function member(values: Partial<typeof members.$inferInsert> & { id: string }) {
  return { fullName: values.id, qrToken: `token-${token++}`, ...values };
}

beforeEach(async () => {
  await resetTestDatabase(database.client);
  await database.db.insert(cellGroups).values({ id: "cell", name: "Kabataan" });
  await database.db.insert(members).values([
    member({ id: "new-year", birthdate: "1985-01-02", cellGroupId: "cell" }),
    member({ id: "leap", birthdate: "1992-02-29" }),
    member({ id: "married", maritalStatus: "married", weddingAnniversary: "2015-12-31" }),
    member({ id: "single", maritalStatus: "single", weddingAnniversary: "2015-12-31" }),
    member({ id: "transferred", status: "transferred", birthdate: "1980-12-31" }),
    member({ id: "deceased", status: "deceased", spiritualBirthday: "1970-12-30" }),
    member({ id: "later", birthdate: "1980-01-06", spiritualBirthday: "2001-06-15" }),
  ]);
});
afterAll(() => database.client.end());

it("finds the week across New Year, leaving out the unmarried and departed", async () => {
  const rows = await celebrationsIn(celebrationWindow("week", "2026-12-30"));

  expect(rows.map((r) => [r.memberId, r.kind, r.observedOn])).toEqual([
    ["married", "wedding_anniversary", "2026-12-31"],
    ["new-year", "birthday", "2027-01-02"],
  ]);
  expect(rows[1].cellGroup).toEqual({ id: "cell", name: "Kabataan" });
});

it("matches a 29 February birthday on the 28th of a common year", async () => {
  const rows = await celebrationsIn({ start: "2027-02-28", end: "2027-02-28" });
  expect(rows.map((r) => [r.memberId, r.observedOn])).toEqual([
    ["leap", "2027-02-28"],
  ]);

  const leapYear = await celebrationsIn({ start: "2028-02-28", end: "2028-02-28" });
  expect(leapYear).toEqual([]);
});
