// After migrate rewrites a project: installs its dependencies with its own
// package manager, then typechecks it with its own TypeScript. Run from the
// target directory; `node after-migrate.mjs install`. The result is one JSON
// line on stdout, which the workflow reads from the step's output; progress
// goes to stderr.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];
const ERRORS_SHOWN = 10;
const ERROR_LINES = 12;

/**
 * Where to install and with what: the nearest directory from `target` up to
 * the repository root that has a lockfile, and the manager that lockfile
 * belongs to. Without a lockfile, the target's `packageManager` field decides,
 * else npm.
 */
export function installPlan(target, gitRoot = target) {
  for (let directory = target; ; directory = dirname(directory)) {
    const lockfile = LOCKFILES.find(([name]) => existsSync(join(directory, name)));
    if (lockfile) return { directory, manager: lockfile[1] };
    if (directory === gitRoot || dirname(directory) === directory) break;
  }
  const declared = readJson(join(target, "package.json"))?.packageManager?.split("@")[0];
  return { directory: target, manager: ["pnpm", "yarn", "bun", "npm"].includes(declared) ? declared : "npm" };
}

/**
 * The tsconfig files to check, relative to the target: each tracked
 * tsconfig.json, except one that only lists project references, which is
 * replaced by the configs it references, and a workspace root's own config
 * when its packages have theirs (it would check every package again).
 */
export function typecheckConfigs(target, trackedTsconfigs) {
  const configs = [];
  const packageDirectories = new Set(trackedTsconfigs.map(dirname));
  for (const file of trackedTsconfigs) {
    const config = readJson(join(target, file));
    if (config === undefined) continue;
    const isWorkspaceRoot = dirname(file) === "." && packageDirectories.size > 1 && config.include === undefined && config.files === undefined;
    if (isWorkspaceRoot) continue;
    const referencesOnly = Array.isArray(config.references) && Array.isArray(config.files) && config.files.length === 0;
    if (!referencesOnly) {
      configs.push(file);
      continue;
    }
    for (const reference of config.references) {
      const path = join(dirname(file), reference.path);
      const referenced = path.endsWith(".json") ? path : join(path, "tsconfig.json");
      if (existsSync(join(target, referenced))) configs.push(referenced);
    }
  }
  return [...new Set(configs)];
}

/** `{ errors, files, first }` from `tsc --pretty false` output, paths relative to `from`. */
export function parseTscOutput(text, configDirectory, from) {
  const errors = text
    .split("\n")
    .map((line) => /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line))
    .filter(Boolean)
    .map(([, file, line, column, code, message]) => ({
      file: relative(from, resolve(configDirectory, file)),
      line: Number(line),
      column: Number(column),
      code,
      message,
    }));
  return { errors: errors.length, files: new Set(errors.map((error) => error.file)).size, first: errors.slice(0, ERRORS_SHOWN) };
}

/** The project's own tsc for a config: the nearest node_modules/typescript up to the target. */
export function projectTsc(target, configDirectory) {
  for (let directory = configDirectory; ; directory = dirname(directory)) {
    const tsc = join(directory, "node_modules/typescript/bin/tsc");
    if (existsSync(tsc)) return tsc;
    if (directory === target || dirname(directory) === directory) return undefined;
  }
}

function install(target) {
  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: target, encoding: "utf8" });
  const plan = installPlan(target, gitRoot.status === 0 ? gitRoot.stdout.trim() : target);
  const command = `${plan.manager} install`;
  const where = relative(target, plan.directory) || ".";
  console.error(`Installing with ${command} in ${where}`);
  const result = spawnSync(plan.manager, ["install"], {
    cwd: plan.directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
  const ok = result.status === 0;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return {
    command,
    directory: where,
    ok,
    ...(ok ? {} : { error: result.error ? String(result.error.message) : installError(output) }),
  };
}

/**
 * The part of a failed install's output that names the cause: from its first
 * error line, without blank lines or pointers to log files, at most
 * ERROR_LINES lines. npm's ERESOLVE report puts the conflicting package first
 * and its log paths last.
 */
export function installError(output) {
  const lines = output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^(npm (error|ERR!))?\s*$/.test(line) && !/_logs\/|full report|complete log/i.test(line));
  const start = Math.max(0, lines.findIndex((line) => /\berr(or)?\b|ERR_|ERESOLVE/i.test(line)));
  return lines.slice(start, start + ERROR_LINES).join("\n");
}

function typecheck(target) {
  const tracked = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*tsconfig.json"], { cwd: target, encoding: "utf8" });
  const files = tracked.status === 0 ? tracked.stdout.split("\n").filter((file) => file !== "" && !file.includes("node_modules/")) : ["tsconfig.json"].filter((file) => existsSync(join(target, file)));
  return typecheckConfigs(target, files).map((config) => {
    const configDirectory = dirname(join(target, config));
    const tsc = projectTsc(target, configDirectory);
    if (tsc === undefined) return { config, skipped: "TypeScript isn't installed" };
    console.error(`Typechecking ${config}`);
    const result = spawnSync(process.execPath, [tsc, "--noEmit", "--pretty", "false", "-p", join(target, config)], {
      cwd: configDirectory,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    return { config, ...parseTscOutput(result.stdout ?? "", configDirectory, target) };
  });
}

function readJson(path) {
  try {
    // tsconfig files may hold comments and trailing commas.
    return JSON.parse(readFileSync(path, "utf8").replace(/("(?:\\.|[^"\\])*")|\/\/.*|\/\*[\s\S]*?\*\//g, (match, string) => string ?? "").replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return undefined;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.cwd();
  const installed = install(target);
  // After a failed install, node_modules still holds Solid 1's types, so a
  // typecheck would report against the wrong version.
  const result = { install: installed, typecheck: installed.ok ? typecheck(target) : [] };
  console.log(JSON.stringify(result));
}
