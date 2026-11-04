import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    const legacyTooling = ["babel-preset-solid", "vite-plugin-solid"].filter(
      (name) => declared[name] !== undefined,
    );
    const onSolid2 = typeof solid === "string" && /(^|[^0-9.])2\.0\.0/.test(solid);
    const problems = [];
    if (typeof solid === "string" && !onSolid2) {
      problems.push(`solid-js is declared as ${JSON.stringify(solid)}, a Solid 1 range`);
    }
    if (typeof solid === "string" && web === undefined) {
      problems.push("@solidjs/web, the Solid 2 web renderer package, is not declared");
    }
    if (legacyTooling.length > 0) {
      problems.push(`${legacyTooling.join(" and ")} compile Solid 1 JSX only`);
    }
    if (problems.length > 0) {
      findings.push(`package.json:1:1 Manual review required: move this project's Solid dependencies to ${SOLID_TARGET}.
Why: ${problems.join("; ")}. Solid 2 splits the web renderer into @solidjs/web, versions it in lockstep with solid-js, and compiles JSX through @solidjs/vite-plugin (or @solidjs/babel-plugin), which is what the official solid-v2 templates use.
Guidance: Pin solid-js and @solidjs/web to the exact same RC version (${SOLID_TARGET.split("@")[1]}), replace babel-preset-solid or vite-plugin-solid with @solidjs/vite-plugin, and re-run this analyzer after installing, since Solid 1 source is the input this version understands. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}#imports-where-things-live-now`);
    }
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

/**
 * `[workflow] [--target <dir>] [--allow-dirty]`. The workflow defaults to
 * `analyze`, so every pre-existing invocation keeps its meaning;
 * `--allow-dirty` is accepted only with `transform`, the one workflow that
 * writes to the target.
 */
export function parseArguments(argumentsList) {
  let workflow = "analyze";
  let target = ".";
  let allowDirty = false;
  let hasExplicitTarget = false;
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

  return { workflow, target, allowDirty };
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

export function runCodemod(target, { spawnImpl = spawnSync, workflow = "analyze" } = {}) {
  return spawnImpl(
    process.execPath,
    [resolveCodemodLauncher(), ...buildCodemodArguments(target, workflow)],
    {
      cwd: packageDirectory,
      // Codemod routes all workflow step console output to its stderr and its
      // progress envelope to stdout. Swap the child's fds so the guidance (the
      // product) reaches our stdout while progress stays on our stderr.
      stdio: [0, 2, 1],
    },
  );
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

  if (parsed.workflow === "analyze") {
    const findings = projectImpl(target);
    if (findings.length > 0) console.log(findings.join("\n\n"));
  }

  const result = runImpl(target, parsed.workflow);
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function fail(message) {
  console.error(`[solid-migration-assistant] ${message}`);
  return 2;
}
