import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  COMMANDS,
  DISCLOSURE,
  launch,
  main,
  nodeArguments,
  parseArguments,
  render,
  reportOf,
  resolveBridgeBinary,
} from "../shared/run-workflow.mjs";

const packageDirectory = resolve(import.meta.dirname, "..");

test("defaults to the analyze command and the invocation directory", () => {
  assert.deepEqual(parseArguments([]), { command: "analyze", target: "." });
  assert.deepEqual(parseArguments(["--target", "project"]), {
    command: "analyze",
    target: "project",
  });
  assert.deepEqual(parseArguments(["analyze"]), { command: "analyze", target: "." });
  assert.deepEqual(parseArguments(["transform"]), {
    command: "transform",
    target: ".",
  });
  assert.deepEqual(parseArguments(["transform", "--target", "project"]), {
    command: "transform",
    target: "project",
  });
});

test("rejects unknown, missing, and duplicate options", () => {
  assert.throws(() => parseArguments(["project"]), /unknown argument: project/);
  assert.throws(
    () => parseArguments(["--unknown"]),
    /unknown argument: --unknown/,
  );
  assert.throws(() => parseArguments(["--target"]), /--target requires a value/);
  assert.throws(
    () => parseArguments(["--target", "first", "--target", "second"]),
    /--target may only be specified once/,
  );
  assert.throws(
    () => parseArguments(["transform", "extra"]),
    /unknown argument: extra/,
  );
  assert.throws(
    () => parseArguments(["--target", "project", "transform"]),
    /unknown argument: transform/,
  );
});

test("describes the two workflows the launcher can run", () => {
  assert.deepEqual(Object.keys(COMMANDS), ["analyze", "transform"]);
  assert.deepEqual(COMMANDS.analyze, {
    workflow: "workflows/analyze.ts",
    report: null,
    separator: "\n\n",
    disclosure: true,
    noun: "analyzer",
  });
  assert.deepEqual(COMMANDS.transform, {
    workflow: "workflows/transform.ts",
    report: "report",
    separator: "\n",
    disclosure: false,
    noun: "transform",
  });
});

test("runs the workflow process with type transformation and the node_modules hook", () => {
  assert.deepEqual(nodeArguments(["transform", "--target", "project"]), [
    "--disable-warning=ExperimentalWarning",
    "--experimental-transform-types",
    "--import",
    pathToFileURL(resolve(packageDirectory, "shared/register-ts.mjs")).href,
    resolve(packageDirectory, "shared/run-workflow.mjs"),
    "transform",
    "--target",
    "project",
  ]);
});

test("resolves the bridge from CODEMOD_BRIDGE_BIN or beside the linked orchestration checkout", () => {
  assert.equal(
    resolveBridgeBinary({ CODEMOD_BRIDGE_BIN: "build/bridge" }),
    resolve("build/bridge"),
  );
  const orchestrationEntry = fileURLToPath(
    import.meta.resolve("@codemod.com/orchestration"),
  );
  assert.equal(
    resolveBridgeBinary({}),
    resolve(
      dirname(orchestrationEntry),
      "../../../target/debug/butterflow-execution-bridge",
    ),
  );

  // The orchestration package is the private prototype linked from the
  // sibling codemod checkout; the former Codemod CLI dependency is gone.
  const packageJson = JSON.parse(
    readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
  );
  assert.deepEqual(packageJson.dependencies, {
    "@codemod.com/orchestration": "link:../../../codemod/packages/orchestration",
  });
  assert.equal(packageJson.devDependencies.codemod, undefined);
});

test("forwards termination signals to the workflow process and reports its exit status", async () => {
  const listenersBefore = {
    SIGINT: process.listenerCount("SIGINT"),
    SIGTERM: process.listenerCount("SIGTERM"),
  };
  const child = new EventEmitter();
  const killed = [];
  child.kill = (signal) => killed.push(signal);
  let invocation;
  const status = launch(["--target", "project"], {
    spawnImpl: (executable, argumentsList, options) => {
      invocation = { executable, argumentsList, options };
      return child;
    },
  });

  assert.equal(invocation.executable, process.execPath);
  assert.deepEqual(invocation.argumentsList, nodeArguments(["--target", "project"]));
  assert.deepEqual(invocation.options, { stdio: "inherit" });
  assert.equal(process.listenerCount("SIGINT"), listenersBefore.SIGINT + 1);
  process.emit("SIGINT");
  process.emit("SIGTERM");
  assert.deepEqual(killed, ["SIGINT", "SIGTERM"]);

  child.emit("exit", 23, null);
  assert.equal(await status, 23);
  assert.equal(process.listenerCount("SIGINT"), listenersBefore.SIGINT);
  assert.equal(process.listenerCount("SIGTERM"), listenersBefore.SIGTERM);

  const signalled = new EventEmitter();
  signalled.kill = () => undefined;
  const signalledStatus = launch([], { spawnImpl: () => signalled });
  signalled.emit("exit", null, "SIGKILL");
  assert.equal(await signalledStatus, 1);
});

test("publishes exact immutable public-preview disclosure", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
  );
  assert.match(DISCLOSURE, /Final disclosure/);
  assert.ok(
    DISCLOSURE.includes(`Analyzer: ${packageJson.name}@${packageJson.version}`),
  );
  assert.match(DISCLOSURE, /solid-js@2\.0\.0-rc\.0/);
  assert.match(DISCLOSURE, /ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/);
  assert.match(
    DISCLOSURE,
    /source-only.*incomplete.*no migration-readiness claim/is,
  );
  assert.match(
    DISCLOSURE,
    /does not run target typechecks, builds, tests, scripts, or applications/,
  );
  assert.match(DISCLOSURE, /Read-only/);
  assert.match(
    DISCLOSURE,
    /only the exact destination above; other Solid versions are unsupported/,
  );
  assert.match(DISCLOSURE, /no analyzer telemetry or generated report/);
  assert.match(DISCLOSURE, /Codemod may retain normal workflow or task state/);
  assert.match(DISCLOSURE, /github\.com\/solidjs\/solid\/blob\/ff4d3c44/);
  assert.match(
    DISCLOSURE,
    /github\.com\/devagrawal09\/solid-migration-assistant\/issues/,
  );
  assert.match(DISCLOSURE, /End final disclosure$/);
});

test("renders guidance as blank-line-separated blocks and reports as lines, in the order the workflow returned", () => {
  const stdout = captureStream();
  render(["b\nsecond line", "a"], "analyze", stdout);
  assert.equal(stdout.text(), "b\nsecond line\n\na\n");
  render([], "analyze", stdout);
  render([], "transform", stdout);
  assert.equal(stdout.text(), "b\nsecond line\n\na\n");
  render(["x", "y"], "transform", stdout);
  assert.equal(stdout.text(), "b\nsecond line\n\na\nx\ny\n");

  assert.deepEqual(reportOf({ guidance: ["a"] }, "guidance"), ["a"]);
  assert.deepEqual(reportOf(["a"], null), ["a"]);
  assert.deepEqual(reportOf({ report: [] }, "report"), []);
  assert.throws(() => reportOf({ guidance: "a" }, "guidance"), /no guidance list/);
  assert.throws(() => reportOf({ guidance: [1] }, "guidance"), /no guidance list/);
  assert.throws(() => reportOf(null, "report"), /no report list/);
  assert.throws(() => reportOf(["a"], "report"), /no report list/);
  assert.throws(() => reportOf({ guidance: ["a"] }, null), /no string list/);
});

test("ends successful, failed, and thrown analyzer runs with the disclosure", async () => {
  const controller = new AbortController();
  let received;
  const success = await captureMain([], {
    cwd: packageDirectory,
    signal: controller.signal,
    runImpl: async (invocation, signal) => {
      received = { invocation, signal };
      return ["two", "one"];
    },
  });
  assert.equal(success.status, 0);
  assert.equal(success.stdout, "two\n\none\n");
  assert.deepEqual(success.diagnostics, [DISCLOSURE]);
  assert.deepEqual(received.invocation, {
    command: "analyze",
    target: packageDirectory,
  });
  assert.equal(received.signal, controller.signal);

  const empty = await captureMain(["--target", "."], {
    cwd: packageDirectory,
    runImpl: async () => [],
  });
  assert.equal(empty.status, 0);
  assert.equal(empty.stdout, "");
  assert.deepEqual(empty.diagnostics, [DISCLOSURE]);

  const thrown = await captureMain([], {
    cwd: packageDirectory,
    runImpl: async () => {
      throw new Error("engine unavailable");
    },
  });
  assert.equal(thrown.status, 1);
  assert.equal(thrown.stdout, "");
  assert.deepEqual(thrown.diagnostics, [
    "[solid-migration-assistant] analyzer execution failed: engine unavailable",
    DISCLOSURE,
  ]);
  assertFinalDisclosure(thrown.diagnostics);

  const malformed = await captureMain([], {
    cwd: packageDirectory,
    runImpl: async () => "not a report",
  });
  assert.equal(malformed.status, 1);
  assert.deepEqual(malformed.diagnostics, [
    "[solid-migration-assistant] analyzer execution failed: report.join is not a function",
    DISCLOSURE,
  ]);
});

test("runs the transform command without the disclosure and with its own failure noun", async () => {
  const success = await captureMain(["transform"], {
    cwd: packageDirectory,
    runImpl: async (invocation) => {
      assert.deepEqual(invocation, { command: "transform", target: packageDirectory });
      return ["a", "b"];
    },
  });
  assert.equal(success.status, 0);
  assert.equal(success.stdout, "a\nb\n");
  assert.deepEqual(success.diagnostics, []);

  const failed = await captureMain(["transform", "--target", "."], {
    cwd: packageDirectory,
    runImpl: async () => {
      throw new Error("command 'relocateWebPackage' failed: boom");
    },
  });
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, "");
  assert.deepEqual(failed.diagnostics, [
    "[solid-migration-assistant] transform execution failed: command 'relocateWebPackage' failed: boom",
  ]);
});

test("ends usage and target failures with disclosure without running a workflow", async () => {
  const surface = mkdtempSync(join(tmpdir(), "sma-cli-target-test-"));
  const fileTarget = join(surface, "file-target");
  writeFileSync(fileTarget, "not a directory\n");

  try {
    const cases = [
      {
        argumentsList: ["--unknown"],
        expected: [
          "[solid-migration-assistant] unknown argument: --unknown",
          DISCLOSURE,
        ],
      },
      {
        argumentsList: ["--target", "missing"],
        expected: [
          `[solid-migration-assistant] target does not exist: ${join(surface, "missing")}`,
          DISCLOSURE,
        ],
      },
      {
        argumentsList: ["--target", fileTarget],
        expected: [
          `[solid-migration-assistant] target is not a directory: ${fileTarget}`,
          DISCLOSURE,
        ],
      },
      {
        argumentsList: ["transform", "--unknown"],
        expected: ["[solid-migration-assistant] unknown argument: --unknown"],
      },
      {
        argumentsList: ["transform", "--target", "missing"],
        expected: [
          `[solid-migration-assistant] target does not exist: ${join(surface, "missing")}`,
        ],
      },
    ];

    for (const { argumentsList, expected } of cases) {
      const result = await captureMain(argumentsList, {
        cwd: surface,
        runImpl: () => assert.fail("must not run a workflow"),
      });
      assert.equal(result.status, 2, argumentsList.join(" "));
      assert.equal(result.stdout, "");
      assert.deepEqual(result.diagnostics, expected);
    }
  } finally {
    rmSync(surface, { recursive: true, force: true });
  }
});

function captureStream() {
  let text = "";
  return {
    write(chunk) {
      text += chunk;
      return true;
    },
    text: () => text,
  };
}

async function captureMain(argumentsList, options) {
  const diagnostics = [];
  const stdout = captureStream();
  const originalError = console.error;
  console.error = (...values) => diagnostics.push(values.join(" "));
  try {
    const status = await main(argumentsList, { ...options, stdout });
    return { status, stdout: stdout.text(), diagnostics };
  } finally {
    console.error = originalError;
  }
}

function assertFinalDisclosure(diagnostics) {
  assert.equal(diagnostics.at(-1), DISCLOSURE);
  assert.equal(
    diagnostics.filter((diagnostic) => diagnostic === DISCLOSURE).length,
    1,
  );
}
