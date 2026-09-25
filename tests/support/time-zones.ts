/**
 * Runs `body` once with the process in each of several timezones — Vercel's
 * UTC, the church's Manila, and one behind UTC — restoring the original after.
 * Code that names its zone gives the same answer in all three; code that
 * leans on the process's zone does not, which is how "stored 9 AM on a laptop,
 * 5 PM in production" slipped past tests that only ever ran in Manila.
 *
 * Bun re-reads `process.env.TZ` when it changes, so no subprocess is needed.
 */
export const PROCESS_TIME_ZONES = ["UTC", "Asia/Manila", "America/Los_Angeles"] as const;

export function inEachProcessTimeZone(body: (timeZone: string) => void) {
  const original = process.env.TZ;
  try {
    for (const timeZone of PROCESS_TIME_ZONES) {
      process.env.TZ = timeZone;
      body(timeZone);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}
