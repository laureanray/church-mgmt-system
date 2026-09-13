#!/usr/bin/env bun

import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const source = resolve(import.meta.dir, "irm.ts");
const shareDirectory = join(homedir(), ".local", "share", "irm");
const installed = join(shareDirectory, "irm.ts");
const executable = join(homedir(), ".local", "bin", "irm");
const repo = dirname(dirname(import.meta.dir));

mkdirSync(shareDirectory, { recursive: true, mode: 0o700 });
mkdirSync(dirname(executable), { recursive: true, mode: 0o700 });
copyFileSync(source, installed);
chmodSync(installed, 0o700);
writeFileSync(executable, `#!/bin/sh\nexec bun '${installed.replaceAll("'", `'"'"'`)}' "$@"\n`, { mode: 0o700 });
chmodSync(executable, 0o700);

const init = Bun.spawnSync([executable, "init", "--repo", repo], { stdout: "inherit", stderr: "inherit" });
if (init.exitCode !== 0) process.exit(init.exitCode);

console.log(`Installed: ${executable}`);
if (!(process.env.PATH ?? "").split(":").includes(dirname(executable))) {
  console.log(`Add ${dirname(executable)} to PATH to run irm from any directory.`);
}

