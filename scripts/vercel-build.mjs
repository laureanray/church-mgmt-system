// Vercel runs `vercel-build` in preference to `build`.
// Apply DB migrations ONLY on production deploys, then build.
// Preview deploys skip migration (they point at a separate/no Turso DB).
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.env.VERCEL_ENV === "production") {
  console.log("[vercel-build] production — applying migrations");
  run("pnpm drizzle-kit migrate");
} else {
  console.log(
    `[vercel-build] VERCEL_ENV=${process.env.VERCEL_ENV} — skipping migrations`,
  );
}

run("pnpm next build");
