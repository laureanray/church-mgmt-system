#!/usr/bin/env bun

import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import net from "node:net";

type NetworkMode = "localhost" | "lan" | "tailscale";

type Config = {
  repo: string;
  worktree: string;
  envSource?: string;
  network: NetworkMode;
};

export type Worktree = {
  path: string;
  head: string;
  branch?: string;
  detached: boolean;
  locked?: string;
  prunable?: string;
};

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const CONFIG_PATH = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "irm", "config.json")
  : join(homedir(), ".config", "irm", "config.json");
const STATE_DIR = process.env.XDG_STATE_HOME
  ? join(process.env.XDG_STATE_HOME, "irm")
  : join(homedir(), ".local", "state", "irm");
const WORKTREE_DIR = ".worktrees";
const SERVICES = {
  dev: { port: 3000, command: ["bun", "run", "dev", "--hostname", "0.0.0.0", "--port", "3000"] },
  storybook: { port: 6006, command: ["bun", "run", "storybook", "--host", "0.0.0.0", "--port", "6006", "--no-open"] },
} as const;
type Service = keyof typeof SERVICES;

function command(args: string[], options: { cwd?: string; env?: Record<string, string>; live?: boolean; check?: boolean } = {}): CommandResult {
  const live = options.live ?? false;
  const result = Bun.spawnSync(args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdin: live ? "inherit" : "ignore",
    stdout: live ? "inherit" : "pipe",
    stderr: live ? "inherit" : "pipe",
  });
  const output = {
    stdout: result.stdout ? new TextDecoder().decode(result.stdout).trim() : "",
    stderr: result.stderr ? new TextDecoder().decode(result.stderr).trim() : "",
    exitCode: result.exitCode,
  };
  if ((options.check ?? true) && output.exitCode !== 0) {
    const detail = output.stderr || output.stdout || `exit ${output.exitCode}`;
    throw new Error(`${args[0]} ${args.slice(1).join(" ")} failed: ${detail}`);
  }
  return output;
}

function git(repo: string, args: string[], options: { live?: boolean; check?: boolean } = {}) {
  return command(["git", "-C", repo, ...args], options);
}

export function parseWorktrees(raw: string): Worktree[] {
  return raw
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const values = new Map<string, string>();
      for (const line of block.split("\n")) {
        const space = line.indexOf(" ");
        values.set(space === -1 ? line : line.slice(0, space), space === -1 ? "" : line.slice(space + 1));
      }
      return {
        path: values.get("worktree") ?? "",
        head: values.get("HEAD") ?? "",
        branch: values.get("branch")?.replace(/^refs\/heads\//, ""),
        detached: values.has("detached"),
        locked: values.get("locked"),
        prunable: values.get("prunable"),
      };
    })
    .filter((tree) => tree.path.length > 0);
}

export function branchSlug(branch: string): string {
  const short = branch.includes("/") ? branch.slice(branch.indexOf("/") + 1) : branch;
  return short
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
}

export function rewriteLoopbackUrl(value: string, host: string): string {
  if (!value || host === "localhost" || host === "127.0.0.1") return value;
  try {
    const url = new URL(value);
    if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)) {
      url.hostname = host;
      return url.toString().replace(/\/$/, value.endsWith("/") ? "/" : "");
    }
  } catch {
    return value;
  }
  return value;
}

export function removalReason(input: {
  primary: boolean;
  clean: boolean;
  branch?: string;
  merged: boolean;
  uniqueCommits: number;
}): string | undefined {
  if (input.primary) return "the primary checkout cannot be removed";
  if (!input.clean) return "the worktree has uncommitted changes";
  if (!input.branch) return "detached worktrees are not removed automatically";
  if (!input.merged && input.uniqueCommits > 0) return `${input.uniqueCommits} commit(s) are not on origin/main`;
  return undefined;
}

function discoverPrimaryRepo(cwd = process.cwd()): string {
  const result = command(["git", "-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"], { check: false });
  if (result.exitCode !== 0) throw new Error(`No IRM configuration at ${CONFIG_PATH}; run irm init from the repository.`);
  return dirname(result.stdout);
}

function defaultConfig(repo = discoverPrimaryRepo()): Config {
  const primary = resolve(repo);
  const env = [join(primary, ".env"), join(primary, ".env.local")].find(existsSync);
  return { repo: primary, worktree: primary, ...(env ? { envSource: env } : {}), network: "localhost" };
}

function readConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return defaultConfig();
  const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<Config>;
  if (!parsed.repo) throw new Error(`Invalid configuration at ${CONFIG_PATH}: repo is missing.`);
  return {
    repo: resolve(parsed.repo),
    worktree: resolve(parsed.worktree ?? parsed.repo),
    envSource: parsed.envSource ? resolve(parsed.envSource) : undefined,
    network: parsed.network ?? "localhost",
  };
}

function saveConfig(config: Config) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  const temp = `${CONFIG_PATH}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, CONFIG_PATH);
}

function ensureLocalWorktreeIgnore(repo: string) {
  const exclude = git(repo, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"]).stdout;
  const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (current.split(/\r?\n/).includes(`/${WORKTREE_DIR}/`)) return;
  mkdirSync(dirname(exclude), { recursive: true });
  const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  writeFileSync(exclude, `${current}${separator}# task worktrees managed by irm\n/${WORKTREE_DIR}/\n`);
}

function worktrees(config = readConfig()): Worktree[] {
  return parseWorktrees(git(config.repo, ["worktree", "list", "--porcelain"]).stdout);
}

function primaryTree(config = readConfig()) {
  const first = worktrees(config)[0];
  if (!first) throw new Error(`No Git worktrees are registered for ${config.repo}.`);
  return first;
}

function resolveTree(name: string | undefined, config = readConfig()): Worktree {
  const all = worktrees(config);
  if (!name) {
    return all.find((tree) => resolve(tree.path) === resolve(config.worktree)) ?? all[0];
  }
  const absolute = isAbsolute(name) ? resolve(name) : undefined;
  const matches = all.filter((tree) =>
    resolve(tree.path) === absolute ||
    tree.branch === name ||
    (tree.branch ? branchSlug(tree.branch) === name : false) ||
    basename(tree.path) === name,
  );
  if (matches.length !== 1) {
    throw new Error(`Expected one worktree matching ${JSON.stringify(name)}; found ${matches.length}. Run irm wt.`);
  }
  return matches[0];
}

function statusEntries(tree: Worktree): string[] {
  const raw = git(tree.path, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"]).stdout;
  return raw ? raw.split("\0").filter(Boolean) : [];
}

function tracking(tree: Worktree) {
  const upstream = git(tree.path, ["rev-parse", "--abbrev-ref", "@{upstream}"], { check: false });
  if (upstream.exitCode !== 0) return { upstream: undefined, ahead: undefined, behind: undefined };
  const counts = git(tree.path, ["rev-list", "--left-right", "--count", `HEAD...${upstream.stdout}`]).stdout
    .split(/\s+/)
    .map(Number);
  return { upstream: upstream.stdout, ahead: counts[0], behind: counts[1] };
}

function treeDetails(tree: Worktree, config = readConfig()) {
  const changes = statusEntries(tree);
  return {
    ...tree,
    active: resolve(tree.path) === resolve(config.worktree),
    changes,
    ...tracking(tree),
  };
}

function assertNestedTarget(repo: string, slug: string): string {
  if (!slug) throw new Error("The branch name does not produce a usable worktree directory name.");
  const root = resolve(repo, WORKTREE_DIR);
  const target = resolve(root, slug);
  if (!target.startsWith(`${root}${sep}`)) throw new Error("Refusing a worktree path outside .worktrees.");
  return target;
}

function validateBranch(branch: string) {
  if (!/^(feat|fix|chore|docs|test|refactor|perf|ci|build)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)) {
    throw new Error("Use a conventional branch such as feat/member-import or fix/duplicate-scan.");
  }
  git(readConfig().repo, ["check-ref-format", "--branch", branch]);
}

function isIgnored(tree: string, file: string) {
  return git(tree, ["check-ignore", "-q", "--", file], { check: false }).exitCode === 0;
}

function setupEnvironment(tree: string, config: Config, requestedSource?: string) {
  const source = requestedSource ? resolve(requestedSource) : config.envSource;
  if (!source) {
    console.log("No environment source configured; skipping the .env link. Use irm setup --env /path/to/.env.");
    return config;
  }
  if (!existsSync(source)) throw new Error(`Environment source does not exist: ${source}`);
  const fileName = basename(source).startsWith(".env") ? basename(source) : ".env";
  const destination = join(tree, fileName);
  if (existsSync(destination) || (() => { try { return lstatSync(destination).isSymbolicLink(); } catch { return false; } })()) {
    if (lstatSync(destination).isSymbolicLink() && resolve(dirname(destination), readlinkSync(destination)) === source) {
      console.log(`Environment already linked: ${destination}`);
    } else {
      throw new Error(`${destination} already exists; left intact.`);
    }
  } else {
    const tracked = git(tree, ["ls-files", "--", fileName]).stdout;
    if (tracked || !isIgnored(tree, fileName)) throw new Error(`Refusing to link ${fileName} because Git does not safely ignore it.`);
    symlinkSync(source, destination);
    console.log(`Linked ${destination} -> ${source}`);
  }
  const updated = { ...config, envSource: source };
  saveConfig(updated);
  return updated;
}

function installDependencies(tree: string) {
  if (existsSync(join(tree, "node_modules", ".cache", "irm-ready"))) return;
  command(["bun", "install", "--frozen-lockfile"], { cwd: tree, live: true });
  const marker = join(tree, "node_modules", ".cache", "irm-ready");
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, "ready\n");
}

async function setup(tree: string, envSource: string | undefined, install = true) {
  setupEnvironment(tree, readConfig(), envSource);
  if (install) installDependencies(tree);
  console.log(`Ready: ${tree}`);
}

function serviceSession(service: Service) {
  return `irm-${service}`;
}

function serviceRunning(service: Service) {
  return command(["tmux", "has-session", "-t", `=${serviceSession(service)}`], { check: false }).exitCode === 0;
}

function serviceTree(service: Service): string | undefined {
  if (!serviceRunning(service)) return undefined;
  const result = command(["tmux", "show-options", "-v", "-t", serviceSession(service), "@irm-worktree"], { check: false });
  return result.exitCode === 0 ? result.stdout : undefined;
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (open: boolean) => {
      socket.destroy();
      done(open);
    };
    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function networkAddress(mode: NetworkMode): string {
  if (mode === "localhost") return "localhost";
  if (mode === "tailscale") {
    const result = command(["tailscale", "ip", "-4"], { check: false });
    if (result.exitCode === 0 && result.stdout) return result.stdout.split("\n")[0];
    throw new Error("Tailscale is not connected. Run tailscale up or choose irm network localhost|lan.");
  }
  const routes = command(["ip", "-j", "-4", "route", "show", "default"], { check: false });
  if (routes.exitCode !== 0) throw new Error("Could not inspect the default LAN route.");
  const device = (JSON.parse(routes.stdout) as Array<{ dev?: string }>).find((route) => route.dev && route.dev !== "tailscale0")?.dev;
  if (!device) throw new Error("No LAN interface found.");
  const addresses = JSON.parse(command(["ip", "-j", "-4", "address", "show", "dev", device]).stdout) as Array<{
    addr_info?: Array<{ scope?: string; local?: string }>;
  }>;
  const address = addresses.flatMap((entry) => entry.addr_info ?? []).find((entry) => entry.scope === "global")?.local;
  if (!address) throw new Error(`No LAN address found on ${device}.`);
  return address;
}

function envValue(tree: string, name: string): string {
  const result = command(["bun", "-e", `process.stdout.write(process.env.${name} ?? "")`], { cwd: tree, check: false });
  return result.exitCode === 0 ? result.stdout : "";
}

function serviceEnvironment(tree: string, config: Config): Record<string, string> {
  const host = networkAddress(config.network);
  if (host === "localhost") return {};
  const supabase = rewriteLoopbackUrl(envValue(tree, "NEXT_PUBLIC_SUPABASE_URL"), host);
  return {
    NEXT_PUBLIC_APP_URL: `http://${host}:3000`,
    ...(supabase ? { NEXT_PUBLIC_SUPABASE_URL: supabase } : {}),
    STORYBOOK_ALLOWED_HOSTS: `localhost,127.0.0.1,${host}`,
  };
}

async function startService(service: Service) {
  const config = readConfig();
  const tree = resolveTree(undefined, config).path;
  if (serviceRunning(service)) {
    if (resolve(serviceTree(service) ?? "") !== resolve(tree)) {
      throw new Error(`${service} is running from another worktree. Run irm stop ${service} first.`);
    }
    console.log(`${service} is already running.`);
    return;
  }
  if (await portOpen(SERVICES[service].port)) throw new Error(`Port ${SERVICES[service].port} is occupied by an unmanaged process.`);
  await setup(tree, undefined, true);
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const log = join(STATE_DIR, `${service}.log`);
  const env = serviceEnvironment(tree, config);
  const shellCommand = [
    "exec",
    "env",
    ...Object.entries(env).map(([key, value]) => `${key}=${shellQuote(value)}`),
    ...SERVICES[service].command.map(shellQuote),
    ">>",
    shellQuote(log),
    "2>&1",
  ].join(" ");
  command(["tmux", "new-session", "-d", "-s", serviceSession(service), "-c", tree, shellCommand]);
  command(["tmux", "set-option", "-t", serviceSession(service), "@irm-worktree", tree]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!serviceRunning(service)) throw new Error(`${service} exited. Run irm logs ${service} --lines 80.`);
    if (await portOpen(SERVICES[service].port)) {
      console.log(`Started ${service} from ${tree}; logs: ${log}`);
      return;
    }
    await Bun.sleep(250);
  }
  console.log(`${service} is still starting. Run irm status or irm logs ${service}.`);
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function stopService(service: Service) {
  if (!serviceRunning(service)) {
    console.log(`${service} is not managed/running; unrelated processes were left intact.`);
    return;
  }
  if (!serviceTree(service)) throw new Error(`tmux session ${serviceSession(service)} is not marked as managed by irm; left intact.`);
  command(["tmux", "kill-session", "-t", `=${serviceSession(service)}`]);
  for (let attempt = 0; attempt < 40 && await portOpen(SERVICES[service].port); attempt += 1) await Bun.sleep(100);
  console.log(`Stopped ${service}.`);
}

async function serviceStatus() {
  const config = readConfig();
  const host = networkAddress(config.network);
  const active = resolveTree(undefined, config);
  const lines = [`Worktree: ${active.path}`, `Branch: ${active.branch ?? "detached"}`, `Network: ${config.network}`, ""];
  for (const [name, detail] of Object.entries(SERVICES) as Array<[Service, (typeof SERVICES)[Service]]>) {
    const managed = serviceRunning(name);
    const state = managed ? "running" : await portOpen(detail.port) ? "port occupied (unmanaged)" : "stopped";
    lines.push(`${name.padEnd(10)} ${state.padEnd(26)} http://${host}:${detail.port}`);
    if (managed) lines.push(`           from ${serviceTree(name)}`);
  }
  return lines;
}

async function newWorktree(branch: string, noInstall: boolean) {
  const config = readConfig();
  validateBranch(branch);
  const slug = branchSlug(branch);
  const target = assertNestedTarget(config.repo, slug);
  if (existsSync(target)) throw new Error(`Target already exists: ${target}`);
  if (git(config.repo, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { check: false }).exitCode === 0) {
    throw new Error(`Local branch already exists: ${branch}`);
  }
  console.log("Fetching origin/main...");
  git(config.repo, ["fetch", "origin", "main"], { live: true });
  mkdirSync(dirname(target), { recursive: true });
  git(config.repo, ["worktree", "add", "-b", branch, target, "origin/main"], { live: true });
  const updated = { ...config, worktree: target };
  saveConfig(updated);
  try {
    await setup(target, undefined, !noInstall);
  } catch (error) {
    throw new Error(`Created ${target}, but setup did not finish: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log(`Active worktree: ${target}`);
  console.log(`Enter it with: cd "$(irm cd)"`);
}

async function selectWorktree(name?: string) {
  const config = readConfig();
  let tree: Worktree;
  if (name) {
    tree = resolveTree(name, config);
  } else {
    const all = worktrees(config);
    if (!process.stdin.isTTY) throw new Error("Pass a branch, directory name, or path to irm ws.");
    if (command(["sh", "-c", "command -v fzf"], { check: false }).exitCode === 0) {
      const rows = all.map((item) => `${item.branch ?? "detached"}\t${item.path}`).join("\n");
      const picker = Bun.spawnSync(["fzf", "--with-nth=1", "--delimiter=\t", "--prompt=IRM worktree> "], {
        stdin: Buffer.from(rows), stdout: "pipe", stderr: "inherit",
      });
      if (picker.exitCode !== 0) return;
      tree = resolveTree(new TextDecoder().decode(picker.stdout).trim().split("\t")[1], config);
    } else {
      all.forEach((item, index) => console.log(`${index + 1}. ${item.branch ?? "detached"}  ${item.path}`));
      process.stdout.write("Worktree number: ");
      const answer = (await new Response(Bun.stdin.stream()).text()).trim();
      tree = all[Number(answer) - 1];
      if (!tree) throw new Error("Invalid worktree number.");
    }
  }
  for (const service of Object.keys(SERVICES) as Service[]) {
    const runningFrom = serviceTree(service);
    if (runningFrom && resolve(runningFrom) !== resolve(tree.path)) {
      throw new Error(`${service} is running from another worktree. Run irm stop all before switching.`);
    }
  }
  saveConfig({ ...config, worktree: tree.path });
  console.log(`Active worktree: ${tree.path}`);
  console.log(`Enter it with: cd "$(irm cd)"`);
}

function moveWorktree(name: string) {
  const config = readConfig();
  const tree = resolveTree(name, config);
  if (resolve(tree.path) === resolve(primaryTree(config).path)) throw new Error("The primary checkout cannot be moved.");
  for (const service of Object.keys(SERVICES) as Service[]) {
    const runningFrom = serviceTree(service);
    if (runningFrom && resolve(runningFrom) === resolve(tree.path)) throw new Error(`Stop ${service} before moving this worktree.`);
  }
  const target = assertNestedTarget(config.repo, branchSlug(tree.branch ?? basename(tree.path)));
  if (resolve(tree.path) === resolve(target)) {
    console.log(`Already managed inside ${WORKTREE_DIR}: ${tree.path}`);
    return;
  }
  if (existsSync(target)) throw new Error(`Target already exists: ${target}`);
  mkdirSync(dirname(target), { recursive: true });
  git(config.repo, ["worktree", "move", tree.path, target], { live: true });
  if (resolve(config.worktree) === resolve(tree.path)) saveConfig({ ...config, worktree: target });
  console.log(`Moved ${tree.path} -> ${target}`);
}

function removalAssessment(tree: Worktree, config: Config) {
  const primary = resolve(tree.path) === resolve(primaryTree(config).path);
  const clean = statusEntries(tree).length === 0;
  const merged = tree.branch
    ? git(config.repo, ["merge-base", "--is-ancestor", tree.branch, "origin/main"], { check: false }).exitCode === 0
    : false;
  const uniqueCommits = tree.branch
    ? Number(git(config.repo, ["rev-list", "--count", `origin/main..${tree.branch}`]).stdout || "0")
    : 0;
  return { primary, clean, branch: tree.branch, merged, uniqueCommits };
}

function removeWorktree(name: string) {
  const config = readConfig();
  const tree = resolveTree(name, config);
  const reason = removalReason(removalAssessment(tree, config));
  if (reason) throw new Error(`Refusing to remove ${tree.path}: ${reason}.`);
  for (const service of Object.keys(SERVICES) as Service[]) {
    const runningFrom = serviceTree(service);
    if (runningFrom && resolve(runningFrom) === resolve(tree.path)) throw new Error(`Stop ${service} before removing this worktree.`);
  }
  git(config.repo, ["worktree", "remove", tree.path], { live: true });
  if (resolve(config.worktree) === resolve(tree.path)) saveConfig({ ...config, worktree: primaryTree(config).path });
  if (tree.branch) {
    const deleted = git(config.repo, ["branch", "-d", tree.branch], { live: true, check: false });
    if (deleted.exitCode !== 0) throw new Error(`Removed ${tree.path}, but Git kept branch ${tree.branch}; inspect it before deleting manually.`);
  }
  console.log(`Removed ${tree.path}${tree.branch ? ` and branch ${tree.branch}` : ""}.`);
}

function cleanWorktrees(apply: boolean) {
  const config = readConfig();
  git(config.repo, ["worktree", "prune"]);
  const candidates = worktrees(config)
    .map((tree) => ({ tree, reason: removalReason(removalAssessment(tree, config)) }))
    .filter((item) => !item.reason);
  if (!candidates.length) {
    console.log("No clean, merged worktrees are safe to remove.");
    return;
  }
  for (const { tree } of candidates) console.log(`${apply ? "Removing" : "Would remove"}: ${tree.branch}  ${tree.path}`);
  if (!apply) {
    console.log("Run irm clean --apply to remove these worktrees and their merged branches.");
    return;
  }
  for (const { tree } of candidates) removeWorktree(tree.path);
}

function showWorktrees(json: boolean) {
  const config = readConfig();
  const details = worktrees(config).map((tree) => treeDetails(tree, config));
  if (json) {
    console.log(JSON.stringify(details, null, 2));
    return;
  }
  for (const tree of details) {
    const state = tree.changes.length ? `${tree.changes.length} changed` : "clean";
    const relativePath = relative(config.repo, tree.path);
    const location = relativePath === "" ? "primary" : relativePath.startsWith("..") ? "external" : "managed";
    console.log(`${tree.active ? "*" : " "} ${(tree.branch ?? "detached").padEnd(34)} ${state.padEnd(12)} ${location.padEnd(8)} ${tree.path}`);
  }
}

function showContext(json: boolean) {
  const config = readConfig();
  const active = treeDetails(resolveTree(undefined, config), config);
  const context = {
    repo: config.repo,
    activeWorktree: active,
    recentCommits: git(active.path, ["log", "-5", "--format=%h %s"]).stdout.split("\n"),
    services: Object.fromEntries((Object.keys(SERVICES) as Service[]).filter(serviceRunning).map((service) => [service, serviceTree(service)])),
  };
  if (json) {
    console.log(JSON.stringify(context, null, 2));
    return;
  }
  console.log(`Active: ${active.path}\nBranch: ${active.branch ?? "detached"}`);
  if (active.upstream) console.log(`Tracking: ${active.upstream} (${active.ahead} ahead, ${active.behind} behind; last fetched refs)`);
  console.log("Pending changes:");
  console.log(active.changes.length ? active.changes.map((entry) => `  ${entry}`).join("\n") : "  Clean");
  console.log("Recent commits:");
  console.log(context.recentCommits.map((entry) => `  ${entry}`).join("\n"));
  for (const [service, tree] of Object.entries(context.services)) console.log(`${service} runs from: ${tree}`);
}

function initialize(repoArg?: string, envArg?: string) {
  const repo = resolve(repoArg ?? discoverPrimaryRepo());
  const common = git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).stdout;
  const primary = dirname(common);
  const previous = existsSync(CONFIG_PATH) ? readConfig() : defaultConfig(primary);
  const envSource = envArg ? resolve(envArg) : previous.envSource ?? [join(primary, ".env"), join(primary, ".env.local")].find(existsSync);
  if (envSource && !existsSync(envSource)) throw new Error(`Environment source does not exist: ${envSource}`);
  const registered = parseWorktrees(git(primary, ["worktree", "list", "--porcelain"]).stdout);
  const selected = registered.some((tree) => resolve(tree.path) === resolve(previous.worktree)) ? previous.worktree : registered[0]?.path ?? primary;
  ensureLocalWorktreeIgnore(primary);
  saveConfig({ repo: primary, worktree: selected, ...(envSource ? { envSource } : {}), network: previous.network });
  console.log(`Repository: ${primary}`);
  console.log(`Worktrees: ${join(primary, WORKTREE_DIR)}`);
  console.log(`Configuration: ${CONFIG_PATH}`);
}

function parseFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value.`);
  args.splice(index, 2);
  return value;
}

function help() {
  console.log(`IRM Ministries development manager

Worktrees:
  irm new <type/name> [--no-install]   create under .worktrees/ from fresh origin/main
  irm wt [--json]                     list worktrees, changes, and locations
  irm ws [branch|directory|path]      select the active worktree
  irm move <worktree>                 move an existing tree under .worktrees/
  irm remove <worktree>               remove only when clean and merged/no unique commits
  irm clean [--apply]                 preview or remove all safe stale worktrees
  irm context [--json]                show active Git and service context
  irm cd                              print the active path for: cd "$(irm cd)"
  irm setup [--env /path/to/.env]     safely link env and install dependencies

Services:
  irm run|stop|restart [dev|storybook|all]
  irm logs [dev|storybook] [--lines N]
  irm status
  irm doctor
  irm network [localhost|lan|tailscale]

Configuration:
  irm init [--repo /path] [--env /path/to/.env]
  irm help`);
}

async function main(argv = process.argv.slice(2)) {
  const args = [...argv];
  const action = args.shift() ?? "status";
  if (["help", "--help", "-h"].includes(action)) return help();
  if (action === "init") return initialize(parseFlag(args, "--repo"), parseFlag(args, "--env"));
  if (action === "new") {
    const branch = args.find((arg) => !arg.startsWith("--"));
    if (!branch) throw new Error("Usage: irm new <type/name> [--no-install]");
    return newWorktree(branch, args.includes("--no-install"));
  }
  if (["wt", "list"].includes(action)) return showWorktrees(args.includes("--json"));
  if (["ws", "switch"].includes(action)) return selectWorktree(args[0]);
  if (action === "move") {
    if (!args[0]) throw new Error("Usage: irm move <worktree>");
    return moveWorktree(args[0]);
  }
  if (["remove", "rm"].includes(action)) {
    if (!args[0]) throw new Error("Usage: irm remove <worktree>");
    return removeWorktree(args[0]);
  }
  if (action === "clean") return cleanWorktrees(args.includes("--apply"));
  if (action === "context") return showContext(args.includes("--json"));
  if (action === "cd") return console.log(resolveTree(undefined).path);
  if (action === "setup") return setup(resolveTree(undefined).path, parseFlag(args, "--env"), !args.includes("--no-install"));
  if (action === "network") {
    const config = readConfig();
    const mode = args[0] as NetworkMode | undefined;
    if (mode && !["localhost", "lan", "tailscale"].includes(mode)) throw new Error("Network must be localhost, lan, or tailscale.");
    if (mode) saveConfig({ ...config, network: mode });
    const selected = mode ?? config.network;
    console.log(`Network: ${selected} (${networkAddress(selected)})`);
    if (mode) console.log("Restart running services to apply the new address.");
    return;
  }
  if (["run", "stop", "restart"].includes(action)) {
    const requested = args[0] ?? "all";
    if (![...Object.keys(SERVICES), "all"].includes(requested)) throw new Error(`Unknown service: ${requested}`);
    const selected = requested === "all" ? Object.keys(SERVICES) as Service[] : [requested as Service];
    if (action !== "run") for (const service of selected) await stopService(service);
    if (action !== "stop") for (const service of selected) await startService(service);
    console.log((await serviceStatus()).join("\n"));
    return;
  }
  if (action === "logs") {
    const linesFlag = parseFlag(args, "--lines");
    const service = (args.find((arg) => !arg.startsWith("--")) ?? "dev") as Service;
    if (!Object.hasOwn(SERVICES, service)) throw new Error(`Unknown service: ${service}`);
    const lines = Number(linesFlag ?? "60");
    if (!Number.isInteger(lines) || lines < 1) throw new Error("--lines must be a positive integer.");
    const log = join(STATE_DIR, `${service}.log`);
    mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
    if (!existsSync(log)) writeFileSync(log, "", { mode: 0o600 });
    const follow = linesFlag === undefined;
    command(["tail", "-n", String(lines), ...(follow ? ["-f"] : []), log], { live: true });
    return;
  }
  if (action === "status") return console.log((await serviceStatus()).join("\n"));
  if (action === "doctor") {
    console.log((await serviceStatus()).join("\n"));
    for (const [name, detail] of Object.entries(SERVICES)) {
      try {
        const response = await fetch(`http://127.0.0.1:${detail.port}`, { signal: AbortSignal.timeout(10_000), redirect: "manual" });
        console.log(`${name}: HTTP ${response.status}`);
      } catch (error) {
        console.log(`${name}: unavailable (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    return;
  }
  throw new Error(`Unknown command: ${action}. Run irm help.`);
}

if (import.meta.main) {
  process.umask(0o077);
  main().catch((error) => {
    console.error(`irm: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
