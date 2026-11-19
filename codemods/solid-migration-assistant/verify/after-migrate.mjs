// After migrate rewrites a project: installs its dependencies with its own
// package manager, then typechecks it with its own TypeScript. Run from the
// target directory; `node after-migrate.mjs install [changed package.json
// paths...]`. The result is one JSON line on stdout, which the workflow reads
// from the step's output; progress goes to stderr.
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
 * The command that installs only what migrate changed. Outside a workspace
 * that is `<manager> install` where the lockfile is. In a workspace (a
 * pnpm-workspace.yaml or a package.json `workspaces` field where the
 * lockfile is), a whole-workspace install can be hundreds of packages, so
 * the install is scoped to the packages whose package.json migrate changed
 * (`changed`, relative to the target; the target's own when none), with
 * their workspace dependencies: pnpm `--filter "{dir}..."`, npm `-w dir`.
 * Yarn and Bun, and a change to the workspace root's own package.json, are
 * not installed: `skipped` says why and `command` is what to run.
 */
export function installCommand(target, plan, changed) {
  const manifest = readJson(join(plan.directory, "package.json"));
  const workspace = existsSync(join(plan.directory, "pnpm-workspace.yaml")) || manifest?.workspaces !== undefined;
  if (!workspace) return { args: ["install"], command: `${plan.manager} install` };
  const directories = [...new Set((changed.length > 0 ? changed : ["package.json"]).map((file) => relative(plan.directory, dirname(join(target, file))).replaceAll("\\", "/") || "."))];
  const names = directories.map((directory) => readJson(join(plan.directory, directory, "package.json"))?.name ?? directory);
  if (directories.includes(".")) {
    return { skipped: "migrate changed the workspace root's package.json, and installing there installs every workspace package", command: `${plan.manager} install` };
  }
  if (plan.manager === "pnpm") {
    const args = ["install", ...directories.flatMap((directory) => ["--filter", `{${directory}}...`])];
    return { args, command: `pnpm ${args.map((arg) => (arg.includes("{") ? `"${arg}"` : arg)).join(" ")}` };
  }
  if (plan.manager === "npm") {
    const args = ["install", ...directories.flatMap((directory) => ["-w", directory])];
    return { args, command: `npm ${args.join(" ")}` };
  }
  const command = plan.manager === "yarn" ? `yarn workspaces focus ${names.join(" ")}` : `bun install ${names.map((name) => `--filter ${name}`).join(" ")}`;
  return { skipped: `this is a ${plan.manager} workspace, and a whole-workspace install can be large`, command };
}

/**
 * Where solid-js and @solidjs/web resolve from the target, looked up the
 * way Node does (each node_modules from the target up), with their versions.
 * A problem when one isn't found, is found above the install directory (a
 * stray copy in a parent folder), or isn't on Solid 2: a typecheck would
 * then check against the wrong types.
 */
export function resolutionProblem(target, installDirectory) {
  for (const name of ["solid-js", "@solidjs/web"]) {
    let found;
    for (let directory = target; ; directory = dirname(directory)) {
      const manifest = readJson(join(directory, "node_modules", name, "package.json"));
      if (manifest !== undefined) {
        found = { directory, version: String(manifest.version ?? "") };
        break;
      }
      if (dirname(directory) === directory) break;
    }
    if (found === undefined) return `${name} isn't installed where the project can resolve it`;
    const where = relative(target, join(found.directory, "node_modules", name)) || ".";
    if (relative(installDirectory, found.directory).startsWith("..")) {
      return `${name} resolves to ${found.version} at ${where}, above the project, not the copy this install put in place`;
    }
    if (!/^2\./.test(found.version)) return `${name} resolves to ${found.version} at ${where}, not Solid 2`;
  }
  return null;
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

function install(target, changed) {
  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: target, encoding: "utf8" });
  const plan = installPlan(target, gitRoot.status === 0 ? gitRoot.stdout.trim() : target);
  const where = relative(target, plan.directory) || ".";
  const scoped = installCommand(target, plan, changed);
  const command = scoped.command;
  if (scoped.skipped !== undefined) return { skipped: `${scoped.skipped}; run ${command} in ${where === "." ? "the project root" : where}`, command, directory: where };
  console.error(`Installing with ${command} in ${where}`);
  const result = spawnSync(plan.manager, scoped.args, {
    cwd: plan.directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  // pnpm 11 exits with an error when it skips a dependency's build script it
  // wasn't told to allow, after installing everything; the project can still
  // be typechecked.
  const codes = new Set(output.match(/ERR_PNPM_[A-Z_]+/g) ?? []);
  const ignoredBuilds = result.status !== 0 && codes.size === 1 && codes.has("ERR_PNPM_IGNORED_BUILDS");
  const ok = result.status === 0 || ignoredBuilds;
  return {
    command,
    directory: where,
    root: plan.directory,
    ok,
    ...(ok ? {} : { error: result.error ? String(result.error.message) : installError(output) }),
    ...(ignoredBuilds ? { warning: installError(output) } : {}),
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

function typecheck(target, skipped) {
  const tracked = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*tsconfig.json"], { cwd: target, encoding: "utf8" });
  const files = tracked.status === 0 ? tracked.stdout.split("\n").filter((file) => file !== "" && !file.includes("node_modules/")) : ["tsconfig.json"].filter((file) => existsSync(join(target, file)));
  return typecheckConfigs(target, files).map((config) => {
    const configDirectory = dirname(join(target, config));
    if (skipped !== null) return { config, skipped };
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
  const { root, ...installed } = install(target, process.argv.slice(3));
  // After a failed install, node_modules still holds Solid 1's types, so a
  // typecheck would report against the wrong version; so does a solid-js
  // that resolves from elsewhere (a stray copy in a parent folder).
  const problem = installed.ok ? resolutionProblem(target, root) : null;
  const result = {
    install: installed,
    typecheck: installed.ok ? typecheck(target, problem === null ? null : `${problem}, so a typecheck would not check against Solid 2`) : [],
  };
  console.log(JSON.stringify(result));
}
