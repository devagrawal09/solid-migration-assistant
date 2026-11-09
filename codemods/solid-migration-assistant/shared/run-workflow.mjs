import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SEVERITY_TIERS, severityOf } from "./severity.mjs";
import { DEPENDENCY_MAP, DEPENDENCY_VERIFIED_ON, dependencyHeadline } from "./dependencies.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packageMetadata = JSON.parse(
  readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
);

const SOLID_TARGET = "solid-js@2.0.0-rc.21";
const SOLID_SOURCE_COMMIT = "2105ffb8ca2fced55f5fac0763177fc93f97c2c2";
const MIGRATION_GUIDE = `https://github.com/solidjs/solid/blob/${SOLID_SOURCE_COMMIT}/documentation/solid-2.0/MIGRATION.md`;
const FEEDBACK_URL =
  "https://github.com/devagrawal09/solid-migration-assistant/issues";

export const DISCLOSURE = `[solid-migration-assistant] Final disclosure
Analyzer: ${packageMetadata.name}@${packageMetadata.version}
Reviewed migration destination: ${SOLID_TARGET} (source commit ${SOLID_SOURCE_COMMIT})
Immutable migration guide: ${MIGRATION_GUIDE}
Scope: This source-only analyzer covers project-owned .js, .jsx, .ts, and .tsx source. Coverage is incomplete and advisory, makes no migration-readiness claim, and supports only the exact destination above; other Solid versions are unsupported.
Execution: Read-only. The analyzer does not run target typechecks, builds, tests, scripts, or applications and creates no target report.
Privacy and output: Analyzer telemetry is disabled and no analyzer telemetry or generated report is emitted. Codemod may retain normal workflow or task state outside the target in platform user-data directories; consult Codemod's privacy and state behavior.
Feedback: ${FEEDBACK_URL}
[solid-migration-assistant] End final disclosure`;

/**
 * Read-only findings for the two files every migration must edit that the
 * JSSG analyzers never see: the dependency manifest and the TypeScript JSX
 * configuration. Both are read, never written; a missing or unparsable file
 * produces no finding. The guidance mirrors the official Solid 2 templates
 * (solidjs/templates, `solid-v2` group), which depend on `solid-js` and
 * `@solidjs/web` at the same RC, build with `@solidjs/vite-plugin`, and set
 * `jsxImportSource` to `@solidjs/web`.
 */
export function projectFindings(target) {
  const findings = [];

  const manifest = readJsonLike(resolve(target, "package.json"));
  if (manifest && typeof manifest === "object") {
    const declared = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
    };
    const solid = declared["solid-js"];
    const web = declared["@solidjs/web"];
    const onSolid2 = typeof solid === "string" && /(^|[^0-9.])2\.0\.0/.test(solid);
    const problems = [];
    if (typeof solid === "string" && !onSolid2) {
      problems.push(`solid-js is declared as ${JSON.stringify(solid)}, a Solid 1 range`);
    }
    if (typeof solid === "string" && web === undefined) {
      problems.push("@solidjs/web, the Solid 2 web renderer package, is not declared");
    }
    if (problems.length > 0) {
      findings.push(`package.json:1:1 Manual review required: move this project's Solid dependencies to ${SOLID_TARGET}.
Why: ${problems.join("; ")}. Solid 2 splits the web renderer into @solidjs/web, versions it in lockstep with solid-js, and compiles JSX through @solidjs/vite-plugin (or @solidjs/babel-plugin), which is what the official solid-v2 templates use.
Guidance: Pin solid-js and @solidjs/web to the exact same RC version (${SOLID_TARGET.split("@")[1]}), move the other Solid dependencies as the per-package findings below describe, and run this analyzer before installing, since Solid 1 source is the input this version understands. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}#imports-where-things-live-now`);
    }
  }

  if (manifest && typeof manifest === "object") {
    findings.push(...dependencyFindings(manifest, readFileSync(resolve(target, "package.json"), "utf8")));
  }

  const tsconfig = readJsonLike(resolve(target, "tsconfig.json"));
  const jsxImportSource = tsconfig?.compilerOptions?.jsxImportSource;
  if (jsxImportSource === "solid-js") {
    findings.push(`tsconfig.json:1:1 Manual review required: point jsxImportSource at the Solid 2 renderer package.
Why: compilerOptions.jsxImportSource is "solid-js", but Solid 2 no longer ships JSX runtime type entries from solid-js; web projects take them from @solidjs/web (hyperscript projects from @solidjs/h).
Guidance: Set compilerOptions.jsxImportSource to "@solidjs/web" (keep "jsx": "preserve"), and move any import type { JSX } from "solid-js" to @solidjs/web; the transform workflow rewrites the sole-specifier form of that import and @jsxImportSource pragmas, but not this file. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}#typescript-jsx-solid-js--renderer-package`);
  }

  return findings;
}

/**
 * One finding per dependency in `shared/dependencies.mjs` that the manifest
 * declares on its Solid 1 line (or at all, for packages with no Solid 2
 * line), located at the dependency's line so editors can jump to it. A
 * workspace, catalog, or git range cannot be compared and is reported with a
 * note to check it.
 */
function dependencyFindings(manifest, text) {
  const findings = [];
  const sections = [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies];
  const lines = text.split("\n");
  for (const entry of DEPENDENCY_MAP) {
    const range = sections.map((section) => section?.[entry.name]).find((value) => typeof value === "string");
    if (range === undefined) continue;
    const comparable = /^[\s^~<>=v]*\d/.test(range);
    if (entry.legacy !== null && comparable && !entry.legacy(range)) continue;
    const lineIndex = lines.findIndex((line) => line.includes(`"${entry.name}"`));
    const line = lineIndex === -1 ? 1 : lineIndex + 1;
    const column = lineIndex === -1 ? 1 : lines[lineIndex].indexOf(`"${entry.name}"`) + 1;
    const note = comparable ? "" : ` The declared range ${JSON.stringify(range)} could not be compared, so check which line it resolves to.`;
    findings.push([line, column, `package.json:${line}:${column} ${dependencyHeadline(entry)}
Why: package.json declares ${entry.name} ${JSON.stringify(range)}. Checked against the npm registry on ${DEPENDENCY_VERIFIED_ON}: ${entry.replacement === null ? "no Solid 2 release exists" : `the Solid 2 counterpart is ${entry.replacement}`}.${note}
Guidance: ${entry.guidance} Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}#imports-where-things-live-now`]);
  }
  return findings.sort((left, right) => left[0] - right[0] || left[1] - right[1]).map(([, , text]) => text);
}

/**
 * Parses a JSON file that may carry comments and trailing commas (tsconfig
 * does); returns undefined when the file is missing or still unparsable.
 */
function readJsonLike(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
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

export const WORKFLOWS = Object.freeze({
  analyze: "workflow.yaml",
  transform: "transform.yaml",
});

export const FORMATS = Object.freeze(["text", "json", "agent"]);

/**
 * `[workflow] [--target <dir>] [--allow-dirty] [--format text|json|agent]`. The
 * workflow defaults to `analyze` and the format to `text`, so every
 * pre-existing invocation keeps its meaning; `--allow-dirty` is accepted only
 * with `transform`, the one workflow that writes to the target.
 */
export function parseArguments(argumentsList) {
  let workflow = "analyze";
  let target = ".";
  let allowDirty = false;
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
  return { workflow, target, allowDirty, format };
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

export function buildCodemodArguments(target, workflow = "analyze") {
  return [
    "--disable-analytics",
    "workflow",
    "run",
    "-w",
    resolve(packageDirectory, WORKFLOWS[workflow]),
    "-t",
    target,
    // Codemod's own dirty-tree check is bypassed because the launcher runs
    // its own (`dirtyTreeReason`) before a transform and the analyzer never
    // writes to the target.
    "--allow-dirty",
    "--no-interactive",
  ];
}

export function runCodemod(
  target,
  { spawnImpl = spawnSync, workflow = "analyze", capture = false } = {},
) {
  return spawnImpl(
    process.execPath,
    [resolveCodemodLauncher(), ...buildCodemodArguments(target, workflow)],
    {
      cwd: packageDirectory,
      // Codemod routes all workflow step console output to its stderr and its
      // progress envelope to stdout. Swap the child's fds so the guidance (the
      // product) reaches our stdout while progress stays on our stderr. With
      // `capture`, the step output is collected instead so the launcher can
      // re-emit it as JSON; progress still streams to our stderr.
      stdio: capture ? [0, 2, "pipe"] : [0, 2, 1],
      ...(capture ? { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 } : {}),
    },
  );
}

const STEP_OUTPUT_SUMMARY = "[solid-migration-assistant] Summary: ";
const LOCATED = /^(\S+):(\d+):(\d+) (.*)$/;
const GUIDE_LINK = / Official migration guide: (\S+)$/;

/**
 * The located entries in captured workflow step output. Codemod prefixes
 * every console line from a step with two spaces; the guidance block is that
 * text up to the summary tail, with one blank line between findings, while
 * transform report lines are one per line. Unindented lines are Codemod's
 * own and are ignored.
 */
export function parseStepOutput(text, workflow) {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.startsWith("  "))
    .map((line) => line.slice(2));
  const summary = lines.findIndex((line) => line.startsWith(STEP_OUTPUT_SUMMARY));
  const body = (summary === -1 ? lines : lines.slice(0, summary)).join("\n").trim();
  if (body === "") return [];
  const entries = workflow === "transform" ? body.split("\n").filter((line) => line.trim() !== "") : body.split("\n\n");
  return entries.map(toEntry).filter((entry) => entry !== null);
}

function toEntry(text) {
  const [first = ""] = text.split("\n");
  const located = LOCATED.exec(first);
  if (located === null) return null;
  const guide = GUIDE_LINK.exec(text)?.[1] ?? null;
  return {
    file: located[1],
    line: Number(located[2]),
    column: Number(located[3]),
    headline: located[4].replace(GUIDE_LINK, ""),
    guide,
    text,
  };
}

/**
 * One JSON document for a run: the pinned target, totals (by severity tier
 * for findings), and every finding or rewrite with its location, headline,
 * guide link, and full text. Entries are sorted by file, line, and column.
 */
export function buildJsonReport({ workflow, target, entries, status }) {
  const sorted = [...entries].sort(
    (left, right) =>
      (left.file < right.file ? -1 : left.file > right.file ? 1 : 0) ||
      left.line - right.line ||
      left.column - right.column,
  );
  const files = new Set(sorted.map((entry) => entry.file));
  const report = {
    tool: packageMetadata.name,
    version: packageMetadata.version,
    workflow,
    solid: { target: SOLID_TARGET, sourceCommit: SOLID_SOURCE_COMMIT },
    target,
    status,
  };
  if (workflow === "analyze") {
    const findings = sorted.map((entry) => ({ ...entry, severity: severityOf(entry.headline) }));
    const bySeverity = Object.fromEntries(SEVERITY_TIERS.map((tier) => [tier.id, 0]));
    for (const finding of findings) bySeverity[finding.severity] += 1;
    return { ...report, summary: { findings: findings.length, files: files.size, bySeverity }, findings };
  }
  return {
    ...report,
    summary: { rewrites: sorted.length, files: files.size },
    rewrites: sorted.map(({ file, line, column, headline, guide }) => ({ file, line, column, message: headline, guide })),
  };
}

export function main(
  argumentsList = process.argv.slice(2),
  {
    cwd,
    runImpl = (target, workflow, { capture = false } = {}) =>
      runCodemod(target, { workflow, capture }),
    dirtyImpl = dirtyTreeReason,
    projectImpl = projectFindings,
  } = {},
) {
  let status = 1;

  try {
    status = run(argumentsList, cwd ?? process.cwd(), runImpl, dirtyImpl, projectImpl);
  } catch (error) {
    console.error(
      `[solid-migration-assistant] analyzer execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    console.error(DISCLOSURE);
  }

  return status;
}

function run(argumentsList, invocationDirectory, runImpl, dirtyImpl, projectImpl) {
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

  const projectEntries = parsed.workflow === "analyze" ? projectImpl(target) : [];
  if (parsed.format === "text") {
    if (projectEntries.length > 0) console.log(projectEntries.join("\n\n"));
    const result = runImpl(target, parsed.workflow, { capture: false });
    if (result.error) throw result.error;
    return result.status ?? 1;
  }

  const result = runImpl(target, parsed.workflow, { capture: true });
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  const entries = [
    ...projectEntries.map(toEntry).filter((entry) => entry !== null),
    ...parseStepOutput(result.stderr, parsed.workflow),
  ];
  const report = buildJsonReport({ workflow: parsed.workflow, target, entries, status });
  console.log(parsed.format === "agent" ? buildAgentReport(report) : JSON.stringify(report, null, 2));
  return status;
}

/**
 * The analyzer's findings as one Markdown work list for a coding agent (or a
 * person): grouped by file, each file's tasks in fix order (severity tier,
 * then location), every task carrying the full guidance and its official
 * guide link, followed by the command that re-verifies the result. The
 * analyzer stays the source of truth: the list tells the reader to re-run it
 * rather than to trust its own edits.
 */
export function buildAgentReport(report) {
  const tierOrder = new Map(SEVERITY_TIERS.map((tier, index) => [tier.id, index]));
  const tierLabel = new Map(SEVERITY_TIERS.map((tier) => [tier.id, tier.label]));
  const byFile = new Map();
  for (const finding of report.findings) {
    byFile.set(finding.file, [...(byFile.get(finding.file) ?? []), finding]);
  }
  const files = [...byFile.keys()].sort((left, right) => {
    const worst = (file) => Math.min(...byFile.get(file).map((finding) => tierOrder.get(finding.severity)));
    return worst(left) - worst(right) || (left < right ? -1 : left > right ? 1 : 0);
  });
  const lines = [
    `# Solid 2 migration tasks`,
    "",
    `Target: ${report.solid.target} (source commit ${report.solid.sourceCommit}). Generated by ${report.tool}@${report.version} for \`${report.target}\`.`,
    "",
    `${report.summary.findings} findings in ${report.summary.files} file(s): ${SEVERITY_TIERS.map((tier) => `${report.summary.bySeverity[tier.id]} ${tier.label[0].toLowerCase()}${tier.label.slice(1)}`).join(", ")}.`,
    "",
    "How to work through this list:",
    "",
    "1. Fix every \"will not build or run\" task first; until they are gone the app cannot run, so behavior changes cannot be observed.",
    "2. Follow each task's guidance, including its stop conditions: when a task says to stop and ask, do not guess.",
    "3. Keep each edit to the cited site and keep the project's tests green.",
    `4. Re-run \`npx solid-migration-assistant --format agent --target ${report.target}\` to verify. Fixed tasks disappear; the analyzer, not this list, decides what is done.`,
    "",
  ];
  if (report.findings.length === 0) {
    lines.push("No supported migration sites were found. This is not proof that the project is ready for Solid 2; run its own type, build, and test checks.");
    return lines.join("\n");
  }
  for (const file of files) {
    lines.push(`## \`${file}\``, "");
    const tasks = [...byFile.get(file)].sort(
      (left, right) =>
        tierOrder.get(left.severity) - tierOrder.get(right.severity) ||
        left.line - right.line ||
        left.column - right.column,
    );
    for (const task of tasks) {
      lines.push(`- [ ] \`${task.file}:${task.line}:${task.column}\` ${task.headline} *(${tierLabel.get(task.severity)})*`);
      for (const detail of task.text.split("\n").slice(1)) lines.push(`  ${detail}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function fail(message) {
  console.error(`[solid-migration-assistant] ${message}`);
  return 2;
}
