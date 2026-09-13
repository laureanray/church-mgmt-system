#!/usr/bin/env bun

import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const source = resolve(import.meta.dir, "irm.ts");
const executable = join(homedir(), ".local", "bin", "irm");
const oldCopy = join(homedir(), ".local", "share", "irm", "irm.ts");
const repo = dirname(dirname(import.meta.dir));

mkdirSync(dirname(executable), { recursive: true, mode: 0o700 });

if (existsSync(executable) || lstatOrUndefined(executable)) {
  const stat = lstatSync(executable);
  const alreadyLinked = stat.isSymbolicLink() && resolve(dirname(executable), readlinkSync(executable)) === source;
  if (!alreadyLinked) {
    const oldInstallerWrapper = stat.isFile() && readFileSync(executable, "utf8").includes(oldCopy);
    if (!oldInstallerWrapper && !stat.isSymbolicLink()) {
      throw new Error(`Refusing to replace an unmanaged executable: ${executable}`);
    }
    unlinkSync(executable);
    symlinkSync(source, executable);
  }
} else {
  symlinkSync(source, executable);
}

if (existsSync(oldCopy)) unlinkSync(oldCopy);

const init = Bun.spawnSync([executable, "init", "--repo", repo], { stdout: "inherit", stderr: "inherit" });
if (init.exitCode !== 0) process.exit(init.exitCode);

console.log(`Linked: ${executable} -> ${source}`);
if (!(process.env.PATH ?? "").split(":").includes(dirname(executable))) {
  console.log(`Add ${dirname(executable)} to PATH to run irm from any directory.`);
}

function lstatOrUndefined(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}
