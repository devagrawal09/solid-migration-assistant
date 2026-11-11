import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPORT_MARKER, byLocation, renderAgentReport, renderText, summaryOf } from "./format.mjs";
import { DEPENDENCY_MAP, DEPENDENCY_VERIFIED_ON, dependencyHeadline } from "./dependencies.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packageMetadata = JSON.parse(
  readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
);

const SOLID_VERSION = "2.0.0-rc.21";
const SOLID_TARGET = `solid-js@${SOLID_VERSION}`;
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
    const onSolid2 = isSolid2Range(solid);
    const problems = [];
    if (typeof solid === "string" && !onSolid2) {
      problems.push(`solid-js is declared as ${JSON.stringify(solid)}, a Solid 1 range`);
    }
    if (typeof solid === "string" && web === undefined) {
      problems.push("@solidjs/web, the Solid 2 web renderer package, is not declared");
    }
    if (problems.length > 0) {
      findings.push({
        rule: "project/solid-version",
        file: "package.json",
        line: 1,
        column: 1,
        severity: "build",
        headline: `Move this project's Solid dependencies to ${SOLID_TARGET}.`,
        why: `${problems.join("; ")}. Solid 2 splits the web renderer into @solidjs/web, versions it in lockstep with solid-js, and compiles JSX through @solidjs/vite-plugin (or @solidjs/babel-plugin), which is what the official solid-v2 templates use.`,
        guidance: `Pin solid-js and @solidjs/web to the exact same RC version (${SOLID_VERSION}), move the other Solid dependencies as the per-package findings describe, and run this analyzer before installing, since Solid 1 source is the input this version understands.`,
        lint: [],
        guide: `${MIGRATION_GUIDE}#imports-where-things-live-now`,
      });
    }
    findings.push(...dependencyFindings(manifest, readFileSync(resolve(target, "package.json"), "utf8")));
  }

  const tsconfig = readJsonLike(resolve(target, "tsconfig.json"));
  const jsxImportSource = tsconfig?.compilerOptions?.jsxImportSource;
  if (jsxImportSource === "solid-js") {
    findings.push({
      rule: "project/jsx-import-source",
      file: "tsconfig.json",
      line: 1,
      column: 1,
      severity: "build",
      headline: "Point jsxImportSource at the Solid 2 renderer package.",
      why: 'compilerOptions.jsxImportSource is "solid-js", but Solid 2 no longer ships JSX runtime type entries from solid-js; web projects take them from @solidjs/web (hyperscript projects from @solidjs/h).',
      guidance: 'Set compilerOptions.jsxImportSource to "@solidjs/web" (keep "jsx": "preserve"), and move any import type { JSX } from "solid-js" to @solidjs/web; the transform workflow rewrites the sole-specifier form of that import and @jsxImportSource pragmas, but not this file.',
      lint: [],
      guide: `${MIGRATION_GUIDE}#typescript-jsx-solid-js--renderer-package`,
    });
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
    const note = comparable ? "" : ` The declared range ${JSON.stringify(range)} could not be compared, so check which line it resolves to.`;
    findings.push({
      rule: "project/dependencies",
      file: "package.json",
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

/**
 * The ecosystem-apis rule has no access to package.json (rules only receive
 * `{ filename }`), so a project that has already moved an ecosystem package
 * to its Solid 2 line (`@solidjs/router` 2.0.0-next.*, `@solidjs/meta`
 * 1.0.0-next.*, …) still gets one finding per surviving import that the
 * rule's audited tables list. Filter them here, after collection, so every
 * output format (text, JSON, agent) agrees. The audited Solid 2 line per
 * package is encoded by `DEPENDENCY_MAP[*].legacy`: a non-null `legacy`
 * returning `false` for the declared range means the package is already on
 * its Solid 2 line.
 */
export function filterEcosystemFindings(findings, manifest) {
  const solid2 = packagesOnSolid2Line(manifest);
  // In a project that already declares solid-js 2.x, a function first
  // argument to createSignal or createStore is the documented Solid 2
  // derived form, not a Solid 1 function value, so that rule's review
  // findings are noise there.
  const coreOnSolid2 = isSolid2Range(declaredSolidVersion(manifest));
  if (solid2.size === 0 && !coreOnSolid2) return findings;
  return findings.filter((finding) => {
    if (coreOnSolid2 && finding.rule === "reactivity/create-signal-function") return false;
    if (finding.rule !== "imports/ecosystem-apis") return true;
    const pkg = ecosystemPackageFromHeadline(finding.headline);
    if (pkg === null) return true;
    return !solid2.has(rootPackage(pkg));
  });
}

/**
 * The set of ecosystem packages whose declared range in `manifest` sits on
 * the Solid 2 line audited by `shared/dependencies.mjs`. A package whose
 * `legacy` predicate is `null` has no Solid 2 line at all, so it is never
 * returned, even when the manifest declares a 2.x range for it.
 */
export function packagesOnSolid2Line(manifest) {
  const solid2 = new Set();
  if (!manifest || typeof manifest !== "object") return solid2;
  const declared = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  };
  for (const entry of DEPENDENCY_MAP) {
    if (entry.legacy === null) continue;
    const range = declared[entry.name];
    if (typeof range !== "string") continue;
    const comparable = /^[\s^~<>=v]*\d/.test(range);
    if (comparable && !entry.legacy(range)) solid2.add(entry.name);
  }
  return solid2;
}

/**
 * The package the ecosystem-apis rule names in its headline. The rule
 * writes three per-name forms, all ending in `from <package>` followed by
 * `,` or `.`, plus one package-level form for `@solidjs/start` / `vinxi`
 * subpaths with no mapping: `Migrate this <package> import, which has no
 * Solid 2 release.`. Returns the package (possibly a subpath like
 * `@solidjs/start/config`), or null for a headline this rule did not write.
 */
export function ecosystemPackageFromHeadline(headline) {
  if (typeof headline !== "string") return null;
  const fromMatch = headline.match(/ import from ([^\s,.]+)/);
  if (fromMatch !== null) return fromMatch[1];
  const noReleaseMatch = headline.match(/^Migrate this (\S+) import, which has no Solid 2 release\.$/);
  if (noReleaseMatch !== null) return noReleaseMatch[1];
  return null;
}

/** The root npm package name for a bare or subpath import specifier. */
function rootPackage(name) {
  if (name.startsWith("@")) {
    const parts = name.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : name;
  }
  return name.split("/")[0];
}

/**
 * The declared solid-js range from `manifest`, or null when none is
 * declared. Peer dependencies are included so a library that peers on
 * solid-js is still seen as declaring it.
 */
export function declaredSolidVersion(manifest) {
  if (!manifest || typeof manifest !== "object") return null;
  const declared = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  };
  const range = declared["solid-js"];
  return typeof range === "string" ? range : null;
}

/**
 * Whether `range` is on the Solid 2 line: an exact, caret, tilde, `=`, `>`,
 * or `>=` range whose major is 2 (any prerelease or release). An upper
 * bound such as `<2.0.0` or `>=1.0.0 <2.0.0`, a dist-tag, or a workspace
 * protocol is not.
 */
export function isSolid2Range(range) {
  return typeof range === "string" && /^\s*(?:[\^~=v]|>=?)?\s*2\.\d/.test(range);
}

/**
 * The one-line stderr notice that this project's package.json already
 * declares Solid 2, so remaining findings are Solid 1 API sites. Returns
 * null when the project does not declare Solid 2.
 */
export function solid2Notice(manifest) {
  const range = declaredSolidVersion(manifest);
  if (!isSolid2Range(range)) return null;
  return `[solid-migration-assistant] This project's package.json already declares Solid 2 (solid-js ${JSON.stringify(range)}). This analyzer understands Solid 1 source, so any findings below are sites that still use Solid 1 APIs in a project that otherwise declares Solid 2.`;
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
    // The report step prints one machine-readable line instead of text; the
    // launcher renders every format from it (`shared/format.mjs`).
    "--param",
    "format=json",
  ];
}

export function runCodemod(target, { spawnImpl = spawnSync, workflow = "analyze" } = {}) {
  return spawnImpl(
    process.execPath,
    [resolveCodemodLauncher(), ...buildCodemodArguments(target, workflow)],
    {
      cwd: packageDirectory,
      // Codemod prints its progress envelope to stdout and every workflow
      // step's console output to stderr. Progress goes straight to our
      // stderr; step output is captured so the report line can be parsed and
      // everything else (diagnostics) re-emitted on our stderr.
      stdio: [0, 2, "pipe"],
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
}

/**
 * The report the workflow's report step printed (`{ findings, rewrites }`)
 * and every other line of captured step output, which the launcher passes
 * through to stderr so a rule's runtime error is never swallowed. A run that
 * printed no report line (no matching file, or a failure) reports nothing.
 */
export function parseStepOutput(text) {
  let report = { findings: [], rewrites: [] };
  const diagnostics = [];
  for (const line of String(text ?? "").split("\n")) {
    const marker = line.indexOf(REPORT_MARKER);
    if (marker !== -1 && line.slice(0, marker).trim() === "") {
      report = JSON.parse(line.slice(marker + REPORT_MARKER.length));
    } else if (line.trim() !== "") {
      diagnostics.push(line);
    }
  }
  return { ...report, diagnostics };
}

/**
 * One JSON document for a run: the pinned target, totals (by severity tier
 * for findings), and every finding or rewrite, sorted by file, line, and
 * column.
 */
export function buildJsonReport({ workflow, target, findings = [], rewrites = [], status }) {
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
  return { ...report, summary: summaryOf({ rewrites: sorted }), rewrites: sorted };
}

export function main(
  argumentsList = process.argv.slice(2),
  {
    cwd,
    runImpl = (target, workflow) => runCodemod(target, { workflow }),
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

  const manifest = parsed.workflow === "analyze" ? readJsonLike(resolve(target, "package.json")) : null;
  const project = parsed.workflow === "analyze" ? projectImpl(target) : [];
  const result = runImpl(target, parsed.workflow);
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  const { findings, rewrites, diagnostics } = parseStepOutput(result.stderr);
  if (diagnostics.length > 0) console.error(diagnostics.join("\n"));
  const combinedFindings = parsed.workflow === "analyze"
    ? filterEcosystemFindings([...project, ...findings], manifest)
    : [...project, ...findings];
  const report = buildJsonReport({
    workflow: parsed.workflow,
    target,
    findings: combinedFindings,
    rewrites,
    status,
  });
  if (parsed.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (parsed.format === "agent") {
    console.log(renderAgentReport(report));
  } else {
    const text = renderText({ findings: report.findings ?? [], rewrites: report.rewrites ?? [], solidVersion: SOLID_VERSION });
    console.log(
      text !== ""
        ? text
        : `[solid-migration-assistant] ${parsed.workflow === "analyze" ? "No supported migration sites found. This is not proof that the project is ready for Solid 2; run its own type, build, and test checks." : "Nothing to rewrite."}`,
    );
  }
  if (parsed.workflow === "analyze") {
    const notice = solid2Notice(manifest);
    if (notice !== null) console.error(notice);
  }
  return status;
}

export { renderAgentReport as buildAgentReport };

function fail(message) {
  console.error(`[solid-migration-assistant] ${message}`);
  return 2;
}
