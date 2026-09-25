// Prepare face check-in on a deployment: check the Tencent Cloud key works and
// create the deployment's face group if it does not exist yet. Safe to re-run.
//
//   bun run face:setup
//
// Reads TENCENTCLOUD_SECRET_ID, TENCENTCLOUD_SECRET_KEY, TENCENTCLOUD_REGION
// and FACE_GROUP_ID from the environment or .env. Against production, run it
// with that deployment's values in the environment — and never point a
// development .env at the production group. The README has the rest.
//
// The package script runs this with `--conditions=react-server`, because
// lib/tencent-face.ts imports "server-only", which throws anywhere else.
try {
  process.loadEnvFile(".env");
} catch {
  // Env already provided (CI, or a production shell).
}

async function main() {
  const { faceConfig, ensureFaceGroup, describeFaceGroup, isTencentFaceError } =
    await import("../lib/tencent-face");
  const { faceProblem } = await import("../lib/face-policy");

  const config = faceConfig();
  if (!config) {
    const missing = ["TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY", "FACE_GROUP_ID"]
      .filter((name) => !process.env[name]?.trim());
    console.error(`Face check-in is off: set ${missing.join(", ")}.`);
    process.exit(1);
  }

  try {
    const outcome = await ensureFaceGroup();
    const { people, faces } = await describeFaceGroup();
    console.log(
      `${outcome === "created" ? "Created" : "Found"} face group "${config.groupId}" in ${config.region}: ` +
        `${people} ${people === 1 ? "person" : "people"}, ${faces} ${faces === 1 ? "photo" : "photos"}.`,
    );
  } catch (error) {
    if (!isTencentFaceError(error)) throw error;
    console.error(`${error.code}: ${faceProblem(error.code).message}`);
    console.error(`Tencent said: ${error.message}${error.requestId ? ` (request ${error.requestId})` : ""}`);
    process.exit(1);
  }
}

await main();

export {};
