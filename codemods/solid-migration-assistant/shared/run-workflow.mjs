import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { byLocation, placeOf, renderAgentReport, renderText, summaryOf } from "./format.mjs";
import { DEPENDENCY_MAP, DEPENDENCY_VERIFIED_ON, dependencyHeadline } from "./dependencies.mjs";
import { allowsSolid2 } from "./peers.mjs";
import { settleUnknownDependencies } from "./registry.mjs";
import { catalogName, readCatalogs } from "./catalog.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packageMetadata = JSON.parse(
  readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
);

const SOLID_VERSION = "2.0.0";
const SOLID_TARGET = `solid-js@${SOLID_VERSION}`;
const SOLID_SOURCE_COMMIT = "a8186e6738b3a6a3341c561f66e9325432d6759b";
const MIGRATION_GUIDE = `https://github.com/solidjs/solid/blob/${SOLID_SOURCE_COMMIT}/documentation/solid-2.0/MIGRATION.md`;
const FEEDBACK_URL =
  "https://github.com/devagrawal09/solid-migration-assistant/issues";

export const DISCLOSURE = `[solid-migration-assistant] Final disclosure
Analyzer: ${packageMetadata.name}@${packageMetadata.version}
Reviewed migration destination: ${SOLID_TARGET} (source commit ${SOLID_SOURCE_COMMIT})
Immutable migration guide: ${MIGRATION_GUIDE}
Scope: This source-only analyzer covers project-owned .js, .jsx, .ts, and .tsx source. Coverage is incomplete and advisory, makes no migration-readiness claim, and supports only the exact destination above; other Solid versions are unsupported.
Execution: analyze is read-only and runs nothing in the target; it asks the public npm registry about Solid libraries its dependency table doesn't list (--offline skips that). transform rewrites source, package.json and tsconfig.json, then installs with the project's package manager, which runs the project's install scripts and updates its lockfile and node_modules (--no-install skips it), and typechecks with the project's own TypeScript. Neither runs builds, tests, or applications, or creates a target report.
Privacy and output: Analyzer telemetry is disabled and no analyzer telemetry or generated report is emitted. Codemod may retain normal workflow or task state outside the target in platform user-data directories; consult Codemod's privacy and state behavior.
Feedback: ${FEEDBACK_URL}
[solid-migration-assistant] End final disclosure`;

/**
 * Read-only findings for the two files every migration must edit that the
 * JSSG analyzers never see, in every workspace package: each package.json
 * and tsconfig.json. They are read, never written; a missing or unparsable
 * file produces no finding. The guidance mirrors the official Solid 2 templates
 * (solidjs/templates, `solid-v2` group), which depend on `solid-js` and
 * `@solidjs/web` at the same version, build with `@solidjs/vite-plugin`, and set
 * `jsxImportSource` to `@solidjs/web`.
 */
export function projectFindings(target) {
  const files = projectFiles(target);
  const manifests = files.filter((file) => basename(file) === "package.json");
  const workspaceNames = new Set(manifests.map((file) => readJsonLike(resolve(target, file))?.name).filter(Boolean));
  const catalogs = readCatalogs(readText(resolve(target, "pnpm-workspace.yaml")) ?? "");
  const findings = [];
  for (const file of manifests) findings.push(...manifestFindings(target, file, workspaceNames, catalogs));
  for (const file of files.filter((file) => basename(file) === "tsconfig.json")) {
    const jsxImportSource = readJsonLike(resolve(target, file))?.compilerOptions?.jsxImportSource;
    if (jsxImportSource !== "solid-js") continue;
    findings.push({
      rule: "project/jsx-import-source",
      file,
      line: 1,
      column: 1,
      severity: "build",
      headline: "Point jsxImportSource at the Solid 2 renderer package.",
      why: 'compilerOptions.jsxImportSource is "solid-js", but Solid 2 no longer ships JSX runtime type entries from solid-js; web projects take them from @solidjs/web (hyperscript projects from @solidjs/h).',
      guidance: 'Set compilerOptions.jsxImportSource to "@solidjs/web" (keep "jsx": "preserve"), and move any import type { JSX } from "solid-js" to @solidjs/web; the transform workflow makes this edit in migrate mode.',
      lint: [],
      guide: `${MIGRATION_GUIDE}#typescript-jsx-solid-js--renderer-package`,
    });
  }
  return byLocation(findings);
}

/**
 * Every package.json and tsconfig.json the workflow also sees: with git, the
 * tracked and untracked files git doesn't ignore; otherwise a walk that skips
 * node_modules and dot directories. Paths are relative to the target.
 */
function projectFiles(target) {
  const listed = spawnSync("git", ["-C", target, "ls-files", "-co", "--exclude-standard", "--", "package.json", "**/package.json", "tsconfig.json", "**/tsconfig.json"], { encoding: "utf8" });
  if (listed.status === 0) return listed.stdout.split("\n").filter(Boolean).filter((file) => existsSync(resolve(target, file))).sort();
  const files = [];
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(resolve(target, directory), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) walk(path);
      else if (entry.isFile() && (entry.name === "package.json" || entry.name === "tsconfig.json")) files.push(path);
    }
  };
  walk("");
  return files.sort();
}

function manifestFindings(target, file, workspaceNames, catalogs) {
  const manifest = readJsonLike(resolve(target, file));
  if (!manifest || typeof manifest !== "object") return [];
  const text = readFileSync(resolve(target, file), "utf8");
  const findings = [];
  const declared = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  const solid = declared["solid-js"];
  const web = declared["@solidjs/web"];
  const catalog = catalogName(solid);
  const resolved = catalog === null ? solid : catalogs.get(catalog)?.get("solid-js")?.range;
  const where = catalog === null ? "" : catalog === "" ? "the default catalog in pnpm-workspace.yaml" : `the ${catalog} catalog in pnpm-workspace.yaml`;
  const onSolid2 = typeof resolved === "string" && /(^|[^0-9.])2\.\d/.test(resolved);
  const problems = [];
  if (typeof solid === "string" && catalog !== null && resolved === undefined) {
    problems.push(`solid-js comes from ${JSON.stringify(solid)}, a workspace catalog this analyzer couldn't read, so check that it moves to ${SOLID_VERSION} there`);
  } else if (typeof solid === "string" && !onSolid2) {
    problems.push(catalog === null
      ? `solid-js is declared as ${JSON.stringify(solid)}, a Solid 1 range`
      : `solid-js comes from ${where} at ${JSON.stringify(resolved)}, a Solid 1 range`);
  }
  if (typeof solid === "string" && web === undefined) {
    problems.push("@solidjs/web, the Solid 2 web renderer package, is not declared");
  }
  if (problems.length > 0) {
    findings.push({
      rule: "project/solid-version",
      file,
      line: 1,
      column: 1,
      severity: "build",
      headline: `Move this project's Solid dependencies to ${SOLID_TARGET}.`,
      why: `${problems.join("; ")}. Solid 2 splits the web renderer into @solidjs/web, versions it in lockstep with solid-js, and compiles JSX through @solidjs/vite-plugin (or @solidjs/babel-plugin), which is what the official solid-v2 templates use.`,
      guidance: `Move solid-js to ^${SOLID_VERSION}${catalog === null ? "" : ` in ${where || "the workspace catalog"} (migrate edits pnpm catalogs)`} and add @solidjs/web at the same range (the two release in lockstep), move the other Solid dependencies as the per-package findings describe, and run this analyzer before installing, since Solid 1 source is the input this version understands.`,
      lint: [],
      guide: `${MIGRATION_GUIDE}#imports-where-things-live-now`,
    });
  }
  findings.push(...dependencyFindings(manifest, text, file));
  findings.push(...peerFindings(target, file, manifest, text, workspaceNames));
  return findings;
}

/**
 * One finding per Solid library the dependency table doesn't know, unless
 * its installed copy's solid-js peer range already allows Solid 2. Each
 * carries a `package` field so the launcher can settle it against the npm
 * registry (`shared/registry.mjs`). A library
 * counts when its installed manifest names solid-js, or, when it isn't
 * installed, when its name contains "solid". Workspace packages, local
 * ranges and lint tooling are skipped.
 */
function peerFindings(target, file, manifest, text, workspaceNames) {
  const findings = [];
  const lines = text.split("\n");
  const directory = dirname(resolve(target, file));
  const declared = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  for (const [name, range] of Object.entries(declared)) {
    if (typeof range !== "string" || NOT_LIBRARIES.has(name) || name.startsWith("@types/") || workspaceNames.has(name)) continue;
    if (/^(workspace|link|file|portal):/.test(range) || DEPENDENCY_MAP.some((entry) => entry.name === name)) continue;
    const installed = installedManifest(target, directory, name);
    const peer = installed?.peerDependencies?.["solid-js"] ?? installed?.dependencies?.["solid-js"];
    if (installed === undefined ? !/solid/i.test(name) : peer === undefined || allowsSolid2(peer)) continue;
    const lineIndex = lines.findIndex((line) => line.includes(`"${name}"`));
    findings.push({
      package: name,
      rule: "project/dependencies",
      file,
      line: lineIndex === -1 ? 1 : lineIndex + 1,
      column: lineIndex === -1 ? 1 : lines[lineIndex].indexOf(`"${name}"`) + 1,
      severity: "build",
      headline: `Check that ${name} supports Solid 2.`,
      why: installed === undefined
        ? `${name} isn't installed and isn't in this analyzer's dependency table, so whether it runs on Solid 2 wasn't checked.`
        : `The installed ${name}${installed.version ? ` ${installed.version}` : ""} declares solid-js ${JSON.stringify(peer)}, which doesn't allow Solid 2, and it isn't in this analyzer's dependency table.`,
      guidance: `Look for a release whose solid-js peer range includes ${SOLID_VERSION} (check its latest tag first, then next, rc and beta) and move to it, or replace it. A Solid 1 build of it that imports solid-js/web or solid-js/store fails the Solid 2 build inside node_modules.`,
      lint: [],
      guide: `${MIGRATION_GUIDE}#imports-where-things-live-now`,
    });
  }
  return findings;
}

const NOT_LIBRARIES = new Set(["solid-js", "@solidjs/web", "eslint-plugin-solid", "prettier-plugin-solid"]);

/** The installed manifest of `name`, looked up the way Node resolves it, from `directory` up to the target. */
function installedManifest(target, directory, name) {
  const root = resolve(target);
  for (let current = directory; ; current = dirname(current)) {
    const manifest = readJsonLike(join(current, "node_modules", name, "package.json"));
    if (manifest !== undefined) return manifest;
    if (current === root || dirname(current) === current) return undefined;
  }
}

/**
 * One finding per dependency in `shared/dependencies.mjs` that the manifest
 * declares on its Solid 1 line (or at all, for packages with no Solid 2
 * line), located at the dependency's line so editors can jump to it. A
 * workspace, catalog, or git range cannot be compared and is reported with a
 * note to check it.
 */
function dependencyFindings(manifest, text, file) {
  const findings = [];
  const sections = [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies];
  const lines = text.split("\n");
  for (const entry of DEPENDENCY_MAP) {
    const range = sections.map((section) => section?.[entry.name]).find((value) => typeof value === "string");
    if (range === undefined) continue;
    const comparable = /^[\s^~<>=v]*\d/.test(range);
    if (entry.legacy !== null && comparable && !entry.legacy(range)) continue;
    const lineIndex = lines.findIndex((line) => line.includes(`"${entry.name}"`));
    const note = comparable ? "" : ` The declared range ${JSON.stringify(range)} could not be compared, so check which line it resolves to.`;
    findings.push({
      rule: "project/dependencies",
      file,
      line: lineIndex === -1 ? 1 : lineIndex + 1,
      column: lineIndex === -1 ? 1 : lines[lineIndex].indexOf(`"${entry.name}"`) + 1,
      severity: "build",
      headline: dependencyHeadline(entry),
      why: `package.json declares ${entry.name} ${JSON.stringify(range)}. Checked against the npm registry on ${DEPENDENCY_VERIFIED_ON}: ${entry.replacement === null ? "no Solid 2 release exists" : `the Solid 2 counterpart is ${entry.replacement}`}.${note}`,
      guidance: entry.guidance,
      lint: [],
      guide: `${MIGRATION_GUIDE}#imports-where-things-live-now`,
    });
  }
  return byLocation(findings);
}

/**
 * Parses a JSON file that may carry comments and trailing commas (tsconfig
 * does); returns undefined when the file is missing or still unparsable.
 */
function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function readJsonLike(path) {
  const text = readText(path);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text
      .replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match, string) => string ?? "")
      .replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(stripped);
    } catch {
      return undefined;
    }
  }
}

export class CliUsageError extends Error {}

/** The launcher's workflow names, as `workflow.ts` modes. */
export const WORKFLOWS = Object.freeze({
  analyze: "analyze",
  transform: "migrate",
});

export const FORMATS = Object.freeze(["text", "json", "agent"]);

/**
 * `[workflow] [--target <dir>] [--allow-dirty] [--allow-blocked] [--no-install] [--offline] [--format text|json|agent]`.
 * The workflow defaults to `analyze` and the format to `text`, so every
 * pre-existing invocation keeps its meaning; `--allow-dirty`,
 * `--allow-blocked` and `--no-install` are accepted only with `transform`,
 * the one workflow that writes to the target. `--offline` skips the npm
 * registry lookups for Solid libraries the dependency table doesn't know.
 */
export function parseArguments(argumentsList) {
  let workflow = "analyze";
  let target = ".";
  let allowDirty = false;
  let allowBlocked = false;
  let install = true;
  let offline = false;
  let format = "text";
  let hasExplicitTarget = false;
  let hasExplicitFormat = false;
  let index = 0;

  if (argumentsList[0] === "analyze" || argumentsList[0] === "transform") {
    workflow = argumentsList[0];
    index = 1;
  }

  for (; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--allow-dirty") {
      if (workflow !== "transform") {
        throw new CliUsageError("--allow-dirty is only accepted with the transform workflow");
      }
      allowDirty = true;
      continue;
    }
    if (argument === "--allow-blocked") {
      if (workflow !== "transform") {
        throw new CliUsageError("--allow-blocked is only accepted with the transform workflow");
      }
      allowBlocked = true;
      continue;
    }
    if (argument === "--no-install") {
      if (workflow !== "transform") {
        throw new CliUsageError("--no-install is only accepted with the transform workflow");
      }
      install = false;
      continue;
    }
    if (argument === "--offline") {
      offline = true;
      continue;
    }
    if (argument === "--format") {
      if (hasExplicitFormat) {
        throw new CliUsageError("--format may only be specified once");
      }
      const value = argumentsList[index + 1];
      if (!FORMATS.includes(value)) {
        throw new CliUsageError(`--format requires one of: ${FORMATS.join(", ")}`);
      }
      format = value;
      hasExplicitFormat = true;
      index += 1;
      continue;
    }
    if (argument !== "--target") {
      throw new CliUsageError(`unknown argument: ${argument}`);
    }
    if (hasExplicitTarget) {
      throw new CliUsageError("--target may only be specified once");
    }

    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CliUsageError("--target requires a value");
    }
    target = value;
    hasExplicitTarget = true;
    index += 1;
  }

  if (format === "agent" && workflow !== "analyze") {
    throw new CliUsageError("--format agent is only accepted with the analyze workflow");
  }
  return { workflow, target, allowDirty, allowBlocked, install, offline, format };
}

/** Backwards-compatible view of `parseArguments` for the analyze workflow. */
export function parseTarget(argumentsList) {
  return parseArguments(argumentsList).target;
}

/**
 * The transform workflow rewrites files in place, so like react-codemod,
 * Next.js's codemods, and `ng update` it refuses a target whose git working
 * tree has uncommitted changes, or that is not inside a git repository at
 * all, unless the caller passes `--allow-dirty`. Returns null when the
 * transform may proceed, else the reason it may not.
 */
export function dirtyTreeReason(target, { spawnImpl = spawnSync } = {}) {
  const status = spawnImpl("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: target,
    encoding: "utf8",
  });
  if (status.error || status.status !== 0) {
    return "target is not inside a git repository (or git is unavailable); commit it to a repository first, or pass --allow-dirty to transform it anyway";
  }
  const dirty = (status.stdout ?? "").split("\n").filter((line) => line.trim() !== "");
  if (dirty.length > 0) {
    return `target has ${dirty.length} uncommitted change(s); commit or stash them first, or pass --allow-dirty to transform anyway`;
  }
  return null;
}

export function resolveCodemodLauncher() {
  return resolve(dirname(require.resolve("codemod/package.json")), "codemod");
}

export function buildCodemodArguments(target, workflow = "analyze", { allowBlocked = false, install = true } = {}) {
  return [
    "--disable-analytics",
    "workflow",
    "run",
    "-w",
    packageDirectory,
    "-t",
    target,
    // Codemod's own dirty-tree check is bypassed because the launcher runs
    // its own (`dirtyTreeReason`) before a transform and the analyzer never
    // writes to the target.
    "--allow-dirty",
    "--no-interactive",
    "--param",
    `mode=${WORKFLOWS[workflow]}`,
    // The eslint-plugin-solid check installs its own tools, so the launcher
    // leaves it off.
    "--param",
    "verify=false",
    ...(install ? [] : ["--param", "install=false"]),
    // The launcher renders every format from the run output (`shared/format.mjs`).
    "--param",
    "report=none",
    // The workflow's one approval is the pause before rewriting a project
    // whose dependencies have no Solid 2 release.
    ...(allowBlocked ? ["--approve"] : []),
  ];
}

// Codemod's own pause lines name a run store that is removed after the run,
// so they are dropped; the launcher states the approval question itself.
const PAUSE_LINE = /^\s*(Waiting for approval:|Resume with:)/;

/**
 * Runs workflow.ts with its run record in a temporary directory, so no state
 * outlives the run. Codemod's step progress streams to `progress` while it
 * runs. Resolves with the exit status, the run status, the approval question
 * when the run paused, and the workflow's return value as `output`
 * (undefined when the run produced none).
 */
export async function runCodemod(
  target,
  { spawnImpl = spawn, workflow = "analyze", allowBlocked = false, install = true, progress = process.stderr } = {},
) {
  const runStore = mkdtempSync(join(tmpdir(), "solid-migration-assistant-run-"));
  try {
    const child = spawnImpl(
      process.execPath,
      [resolveCodemodLauncher(), ...buildCodemodArguments(target, workflow, { allowBlocked, install })],
      {
        cwd: packageDirectory,
        env: { ...process.env, CODEMOD_RUN_STORE_DIR: runStore },
        stdio: [0, 2, "pipe"],
      },
    );
    const status = await new Promise((resolveStatus, reject) => {
      let partial = "";
      const relay = (line) => {
        if (!PAUSE_LINE.test(line)) progress.write(`${line}\n`);
      };
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        const lines = (partial + chunk).split("\n");
        partial = lines.pop();
        lines.forEach(relay);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (partial !== "") relay(partial);
        resolveStatus(code);
      });
    });
    return { status, ...readRun(runStore) };
  } finally {
    rmSync(runStore, { recursive: true, force: true });
  }
}

function readRun(runStore) {
  const [id] = readdirSync(runStore);
  if (id === undefined) return { output: undefined, runStatus: undefined };
  const run = JSON.parse(readFileSync(join(runStore, id, "run.json"), "utf8"));
  return { output: run.output ?? undefined, runStatus: run.status, awaiting: run.awaiting ?? undefined };
}

/**
 * The findings and rewrites the workflow returned, and the diagnostics to
 * print after the run: files a rule step failed on, and why the workflow
 * skipped the target or stopped. Codemod's own stderr was already streamed.
 */
export function parseRunOutput({ output, runStatus }) {
  const diagnostics = [];
  for (const failure of output?.failures ?? []) {
    diagnostics.push(`${failure.step}: ${failure.path}: ${failure.error}`);
  }
  if (output?.skipped) diagnostics.push(`[solid-migration-assistant] skipped: ${output.skipped}`);
  if (output === undefined && runStatus !== undefined && runStatus !== "succeeded") {
    diagnostics.push(`[solid-migration-assistant] the run stopped with status ${runStatus}`);
  }
  return {
    findings: output?.findings ?? [],
    rewrites: output?.rewrites ?? [],
    dependencySkips: output?.dependencySkips ?? [],
    afterMigrate: output?.afterMigrate,
    diagnostics,
  };
}

/**
 * What the user does after a transform: the install when it was skipped or
 * failed, and every dependency range the transform left alone.
 */
export function nextSteps({ dependencySkips = [], afterMigrate }) {
  const steps = [];
  const install = afterMigrate?.install;
  if (install?.skipped) {
    steps.push(`Install with your package manager, then typecheck: package.json now targets Solid ${SOLID_VERSION}.`);
  } else if (install && !install.ok) {
    steps.push(`Run ${install.command} in ${placeOf(install.directory)} once the install error above is fixed, then typecheck.`);
  }
  for (const skip of dependencySkips) {
    steps.push(`Move ${skip.name} ${JSON.stringify(skip.range)} in ${skip.file} by hand: ${skip.reason}.`);
  }
  return steps;
}

/**
 * One JSON document for a run: the pinned target, totals (by severity tier
 * for findings), and every finding or rewrite, sorted by file, line, and
 * column.
 */
export function buildJsonReport({ workflow, target, findings = [], rewrites = [], afterMigrate, next = [], status }) {
  const report = {
    tool: packageMetadata.name,
    version: packageMetadata.version,
    workflow,
    solid: { target: SOLID_TARGET, sourceCommit: SOLID_SOURCE_COMMIT },
    target,
    status,
  };
  if (workflow === "analyze") {
    const sorted = byLocation(findings);
    return { ...report, summary: summaryOf({ findings: sorted }), findings: sorted };
  }
  const sorted = byLocation(rewrites);
  const leftovers = byLocation(findings);
  return {
    ...report,
    summary: summaryOf({ rewrites: sorted }),
    rewrites: sorted,
    leftovers: { summary: summaryOf({ findings: leftovers }), findings: leftovers },
    ...(afterMigrate ? { afterMigrate } : {}),
    ...(next.length > 0 ? { nextSteps: next } : {}),
  };
}

export async function main(
  argumentsList = process.argv.slice(2),
  {
    cwd,
    runImpl = (target, workflow, options) => runCodemod(target, { workflow, ...options }),
    dirtyImpl = dirtyTreeReason,
    projectImpl = projectFindings,
    fetchImpl = fetch,
  } = {},
) {
  let status = 1;

  try {
    status = await run(argumentsList, cwd ?? process.cwd(), runImpl, dirtyImpl, projectImpl, fetchImpl);
  } catch (error) {
    console.error(
      `[solid-migration-assistant] analyzer execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    console.error(DISCLOSURE);
  }

  return status;
}

async function run(argumentsList, invocationDirectory, runImpl, dirtyImpl, projectImpl, fetchImpl) {
  let parsed;
  try {
    parsed = parseArguments(argumentsList);
  } catch (error) {
    if (error instanceof CliUsageError) return fail(error.message);
    throw error;
  }

  const target = resolve(invocationDirectory, parsed.target);
  try {
    if (!statSync(target).isDirectory()) {
      return fail(`target is not a directory: ${target}`);
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return fail(`target does not exist: ${target}`);
    }
    throw error;
  }

  if (parsed.workflow === "transform" && !parsed.allowDirty) {
    const reason = dirtyImpl(target);
    if (reason !== null) return fail(reason);
  }

  const settle = (findings) => settleUnknownDependencies(findings, { fetchImpl, offline: parsed.offline });
  const analyzed = parsed.workflow === "analyze" ? await settle(projectImpl(target)) : [];
  const result = await runImpl(target, parsed.workflow, { allowBlocked: parsed.allowBlocked, install: parsed.install });
  if (result.runStatus === "awaiting-approval") {
    const blocked =
      /^(.+?) Apply the source rewrites anyway\?$/.exec(result.awaiting ?? "")?.[1] ?? "A dependency has no Solid 2 release.";
    return fail(`nothing was rewritten. ${blocked} Pass --allow-blocked to apply the source rewrites anyway.`);
  }
  // A transform's leftovers read package.json and tsconfig.json as it left
  // them, so a dependency it could not move is still listed.
  const project = parsed.workflow === "analyze" ? analyzed : await settle(projectImpl(target));
  const status = result.status ?? 1;
  const { findings, rewrites, dependencySkips, afterMigrate, diagnostics } = parseRunOutput(result);
  const next = parsed.workflow === "analyze" ? [] : nextSteps({ dependencySkips, afterMigrate });
  if (diagnostics.length > 0) console.error(diagnostics.join("\n"));
  const report = buildJsonReport({
    workflow: parsed.workflow,
    target,
    findings: [...project, ...findings],
    rewrites,
    afterMigrate,
    next,
    status,
  });
  if (parsed.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (parsed.format === "agent") {
    console.log(renderAgentReport(report));
  } else {
    const text = renderText({
      findings: report.findings ?? report.leftovers.findings,
      rewrites: report.rewrites ?? [],
      afterMigrate,
      solidVersion: SOLID_VERSION,
    });
    console.log(
      text !== ""
        ? text
        : `[solid-migration-assistant] ${parsed.workflow === "analyze" ? "No supported migration sites found. This is not proof that the project is ready for Solid 2; run its own type, build, and test checks." : "Nothing to rewrite."}`,
    );
    if (next.length > 0) console.log(`\nNext:\n${next.map((line) => `- ${line}`).join("\n")}`);
  }
  return status;
}

export { renderAgentReport as buildAgentReport };

function fail(message) {
  console.error(`[solid-migration-assistant] ${message}`);
  return 2;
}
