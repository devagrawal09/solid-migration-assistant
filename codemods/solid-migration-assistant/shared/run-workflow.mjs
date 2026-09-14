import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(
  readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
);

const SOLID_TARGET = "solid-js@2.0.0-rc.0";
const SOLID_SOURCE_COMMIT = "ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5";
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
 * The two workflows the launcher can run. `analyze` is the default and the
 * only command that ends with the disclosure; it prints one guidance block
 * per detected site separated by blank lines. `transform` prints one report
 * line per edit.
 */
export const COMMANDS = Object.freeze({
  analyze: Object.freeze({
    workflow: "workflows/analyze.ts",
    report: null,
    separator: "\n\n",
    disclosure: true,
    noun: "analyzer",
  }),
  transform: Object.freeze({
    workflow: "workflows/transform.ts",
    report: "report",
    separator: "\n",
    disclosure: false,
    noun: "transform",
  }),
});

export class CliUsageError extends Error {}

/** The command named by the first argument, or `analyze`; never throws. */
export function commandOf(argumentsList) {
  const first = argumentsList[0];
  return typeof first === "string" && Object.hasOwn(COMMANDS, first)
    ? first
    : "analyze";
}

export function parseArguments(argumentsList) {
  const command = commandOf(argumentsList);
  let target = ".";
  let hasExplicitTarget = false;

  for (
    let index = command === argumentsList[0] ? 1 : 0;
    index < argumentsList.length;
    index += 1
  ) {
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

  return { command, target };
}

/**
 * The `butterflow-execution-bridge` binary. `CODEMOD_BRIDGE_BIN` wins;
 * otherwise the debug build of the codemod checkout that provides the
 * linked `@codemod.com/orchestration` package (`packages/orchestration/src`
 * resolves three levels below that checkout's `target/`). The bridge is not
 * distributed, so nothing else is consulted.
 */
export function resolveBridgeBinary(env = process.env) {
  if (env.CODEMOD_BRIDGE_BIN) return resolve(env.CODEMOD_BRIDGE_BIN);
  const orchestrationEntry = fileURLToPath(
    import.meta.resolve("@codemod.com/orchestration"),
  );
  return resolve(
    dirname(orchestrationEntry),
    "../../../target/debug/butterflow-execution-bridge",
  );
}

/**
 * Node flags the workflow process needs: the orchestration package and this
 * package are TypeScript source, and `@codemod.com/orchestration` uses syntax
 * that Node's strip-only mode rejects. `shared/register-ts.mjs` covers `.ts`
 * files under `node_modules`, which Node refuses to strip on its own.
 */
export function nodeArguments(argumentsList) {
  return [
    "--disable-warning=ExperimentalWarning",
    "--experimental-transform-types",
    "--import",
    pathToFileURL(resolve(packageDirectory, "shared/register-ts.mjs")).href,
    fileURLToPath(import.meta.url),
    ...argumentsList,
  ];
}

/**
 * Run this module as the workflow process and return its exit status.
 * SIGINT and SIGTERM are forwarded so the child can cancel the command in
 * flight, print its diagnostics, and exit; the parent only reports its code.
 */
export function launch(argumentsList, { spawnImpl = spawn } = {}) {
  return new Promise((resolveStatus, reject) => {
    const child = spawnImpl(process.execPath, nodeArguments(argumentsList), {
      stdio: "inherit",
    });
    const forwarders = ["SIGINT", "SIGTERM"].map((signal) => [
      signal,
      () => child.kill(signal),
    ]);
    for (const [signal, forward] of forwarders) process.on(signal, forward);
    const release = () => {
      for (const [signal, forward] of forwarders) process.off(signal, forward);
    };
    child.once("error", (error) => {
      release();
      reject(error);
    });
    child.once("exit", (code) => {
      release();
      resolveStatus(code ?? 1);
    });
  });
}

/**
 * Load a TypeScript workflow module through the orchestration build step and
 * run it against `target` with one bridge process per command. Returns the
 * workflow's final value.
 */
export async function runWorkflowFile({ workflowPath, target, bridge, signal }) {
  if (!existsSync(bridge)) {
    throw new Error(
      `bridge binary not found at ${bridge}; build it with 'cargo build -p butterflow-execution-bridge' in the codemod checkout that provides @codemod.com/orchestration, or point CODEMOD_BRIDGE_BIN at a build`,
    );
  }
  const { BridgeExecutor, loadWorkflow, run } = await import(
    "@codemod.com/orchestration"
  );
  const { exports, artifacts } = await loadWorkflow(workflowPath);
  const { output } = await run(exports.default, {
    executor: new BridgeExecutor({ bin: bridge, cwd: target, artifacts }),
    signal,
  });
  return output;
}

/** The string list returned directly or under `key`, or an error. */
export function reportOf(output, key) {
  const report =
    key === null
      ? output
      : output && typeof output === "object" && !Array.isArray(output)
        ? output[key]
        : undefined;
  if (!Array.isArray(report) || report.some((line) => typeof line !== "string")) {
    throw new Error(`workflow returned no ${key ?? "string"} list`);
  }
  return report;
}

export async function runCommand({ command, target }, signal) {
  const definition = COMMANDS[command];
  const output = await runWorkflowFile({
    workflowPath: resolve(packageDirectory, definition.workflow),
    target,
    bridge: resolveBridgeBinary(),
    signal,
  });
  return reportOf(output, definition.report);
}

export function render(report, command, stdout = process.stdout) {
  if (report.length === 0) return;
  stdout.write(`${report.join(COMMANDS[command].separator)}\n`);
}

export async function main(
  argumentsList = process.argv.slice(2),
  { cwd, runImpl = runCommand, signal, stdout = process.stdout } = {},
) {
  const command = commandOf(argumentsList);
  let status = 1;

  try {
    status = await run(argumentsList, cwd ?? process.cwd(), runImpl, signal, stdout);
  } catch (error) {
    console.error(
      `[solid-migration-assistant] ${COMMANDS[command].noun} execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (COMMANDS[command].disclosure) console.error(DISCLOSURE);
  }

  return status;
}

async function run(argumentsList, invocationDirectory, runImpl, signal, stdout) {
  let invocation;
  try {
    invocation = parseArguments(argumentsList);
  } catch (error) {
    if (error instanceof CliUsageError) return fail(error.message);
    throw error;
  }

  const target = resolve(invocationDirectory, invocation.target);
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

  const report = await runImpl({ command: invocation.command, target }, signal);
  render(report, invocation.command, stdout);
  return 0;
}

function fail(message) {
  console.error(`[solid-migration-assistant] ${message}`);
  return 2;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);
  process.exitCode = await main(process.argv.slice(2), {
    signal: controller.signal,
  });
}
