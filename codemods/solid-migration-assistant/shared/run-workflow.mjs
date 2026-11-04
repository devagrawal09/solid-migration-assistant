import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
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

export class CliUsageError extends Error {}

export function parseTarget(argumentsList) {
  let target = ".";
  let hasExplicitTarget = false;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
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

  return target;
}

export function resolveCodemodLauncher() {
  return resolve(dirname(require.resolve("codemod/package.json")), "codemod");
}

export function buildCodemodArguments(target) {
  return [
    "--disable-analytics",
    "workflow",
    "run",
    "-w",
    resolve(packageDirectory, "workflow.yaml"),
    "-t",
    target,
    "--allow-dirty",
    "--no-interactive",
  ];
}

export function runCodemod(target, { spawnImpl = spawnSync } = {}) {
  return spawnImpl(
    process.execPath,
    [resolveCodemodLauncher(), ...buildCodemodArguments(target)],
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
  { cwd, runImpl = runCodemod } = {},
) {
  let status = 1;

  try {
    status = run(argumentsList, cwd ?? process.cwd(), runImpl);
  } catch (error) {
    console.error(
      `[solid-migration-assistant] analyzer execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    console.error(DISCLOSURE);
  }

  return status;
}

function run(argumentsList, invocationDirectory, runImpl) {
  let targetArgument;
  try {
    targetArgument = parseTarget(argumentsList);
  } catch (error) {
    if (error instanceof CliUsageError) return fail(error.message);
    throw error;
  }

  const target = resolve(invocationDirectory, targetArgument);
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

  const result = runImpl(target);
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function fail(message) {
  console.error(`[solid-migration-assistant] ${message}`);
  return 2;
}
