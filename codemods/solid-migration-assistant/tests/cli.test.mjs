import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import {
  buildCodemodArguments,
  DISCLOSURE,
  dirtyTreeReason,
  main,
  parseArguments,
  parseTarget,
  projectFindings,
  resolveCodemodLauncher,
  runCodemod,
} from "../shared/run-workflow.mjs";

const packageDirectory = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

test("defaults the target to the invocation directory", () => {
  assert.equal(parseTarget([]), ".");
  assert.equal(parseTarget(["--target", "project"]), "project");
});

test("parses the optional workflow and the transform-only --allow-dirty flag", () => {
  assert.deepEqual(parseArguments([]), { workflow: "analyze", target: ".", allowDirty: false });
  assert.deepEqual(parseArguments(["analyze", "--target", "p"]), { workflow: "analyze", target: "p", allowDirty: false });
  assert.deepEqual(parseArguments(["transform"]), { workflow: "transform", target: ".", allowDirty: false });
  assert.deepEqual(parseArguments(["transform", "--allow-dirty", "--target", "p"]), { workflow: "transform", target: "p", allowDirty: true });
  assert.throws(() => parseArguments(["--allow-dirty"]), /only accepted with the transform workflow/);
  assert.throws(() => parseArguments(["analyze", "--allow-dirty"]), /only accepted with the transform workflow/);
  assert.deepEqual(buildCodemodArguments("/t", "transform")[4], resolve(packageDirectory, "transform.yaml"));
});

test("refuses to transform a dirty or non-git target unless --allow-dirty", () => {
  const spawnFor = (result) => () => result;
  assert.equal(dirtyTreeReason("/t", { spawnImpl: spawnFor({ status: 0, stdout: "" }) }), null);
  assert.match(dirtyTreeReason("/t", { spawnImpl: spawnFor({ status: 0, stdout: " M a.ts\n?? b.ts\n" }) }), /2 uncommitted change/);
  assert.match(dirtyTreeReason("/t", { spawnImpl: spawnFor({ status: 128, stdout: "" }) }), /not inside a git repository/);
  assert.match(dirtyTreeReason("/t", { spawnImpl: spawnFor({ error: new Error("ENOENT") }) }), /not inside a git repository/);

  const blocked = captureMain(["transform"], {
    cwd: packageDirectory,
    dirtyImpl: () => "target has 1 uncommitted change(s)",
    runImpl: () => assert.fail("must not launch Codemod on a dirty tree"),
  });
  assert.equal(blocked.status, 2);
  assert.deepEqual(blocked.diagnostics, [
    "[solid-migration-assistant] target has 1 uncommitted change(s)",
    DISCLOSURE,
  ]);

  let launched;
  const allowed = captureMain(["transform", "--allow-dirty"], {
    cwd: packageDirectory,
    dirtyImpl: () => assert.fail("--allow-dirty must skip the git check"),
    runImpl: (target, workflow) => {
      launched = { target, workflow };
      return { status: 0 };
    },
  });
  assert.equal(allowed.status, 0);
  assert.deepEqual(launched, { target: packageDirectory, workflow: "transform" });

  const clean = captureMain(["transform"], {
    cwd: packageDirectory,
    dirtyImpl: () => null,
    runImpl: (target, workflow) => ({ status: workflow === "transform" ? 0 : 9 }),
  });
  assert.equal(clean.status, 0);
});

test("reports Solid 1 manifests and jsxImportSource read-only, before the analyzer runs", () => {
  const surface = mkdtempSync(join(tmpdir(), "sma-project-findings-"));
  try {
    const legacy = join(surface, "legacy");
    mkdirSync(legacy);
    writeFileSync(join(legacy, "package.json"), JSON.stringify({ dependencies: { "solid-js": "^1.9.3" }, devDependencies: { "vite-plugin-solid": "^2.11.0" } }));
    writeFileSync(join(legacy, "tsconfig.json"), '{\n  // comment\n  "compilerOptions": { "jsx": "preserve", "jsxImportSource": "solid-js", },\n}\n');
    const findings = projectFindings(legacy);
    assert.equal(findings.length, 2);
    assert.match(findings[0], /^package\.json:1:1 Manual review required: move this project's Solid dependencies to solid-js@2\.0\.0-rc\.21\./);
    assert.match(findings[0], /declared as "\^1\.9\.3", a Solid 1 range; @solidjs\/web, the Solid 2 web renderer package, is not declared; vite-plugin-solid compile Solid 1 JSX only/);
    assert.match(findings[1], /^tsconfig\.json:1:1 Manual review required: point jsxImportSource/);
    assert.match(findings[1], /Official migration guide: https:\/\/github\.com\/solidjs\/solid\/blob\/2105ffb8ca2fced55f5fac0763177fc93f97c2c2\/documentation\/solid-2\.0\/MIGRATION\.md#typescript-jsx-solid-js--renderer-package/);

    const migrated = join(surface, "migrated");
    mkdirSync(migrated);
    writeFileSync(join(migrated, "package.json"), JSON.stringify({ dependencies: { "solid-js": "2.0.0-rc.21", "@solidjs/web": "2.0.0-rc.21" } }));
    writeFileSync(join(migrated, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsxImportSource: "@solidjs/web" } }));
    assert.deepEqual(projectFindings(migrated), []);

    const broken = join(surface, "broken");
    mkdirSync(broken);
    writeFileSync(join(broken, "package.json"), "{ not json");
    writeFileSync(join(broken, "tsconfig.json"), "also not json");
    assert.deepEqual(projectFindings(broken), []);
    assert.deepEqual(projectFindings(join(surface, "missing")), []);

    const printed = [];
    const originalLog = console.log;
    console.log = (...values) => printed.push(values.join(" "));
    let order = [];
    try {
      const result = captureMain(["--target", legacy], {
        cwd: surface,
        projectImpl: (target) => {
          order.push("findings");
          return projectFindings(target);
        },
        runImpl: () => {
          order.push("codemod");
          return { status: 0 };
        },
      });
      assert.equal(result.status, 0);
    } finally {
      console.log = originalLog;
    }
    assert.deepEqual(order, ["findings", "codemod"]);
    assert.equal(printed.length, 1);
    assert.match(printed[0], /^package\.json:1:1 /);
    assert.match(printed[0], /\n\ntsconfig\.json:1:1 /);

    const transformRun = captureMain(["transform", "--allow-dirty", "--target", legacy], {
      cwd: surface,
      projectImpl: () => assert.fail("transform must not print manifest findings"),
      runImpl: () => ({ status: 0 }),
    });
    assert.equal(transformRun.status, 0);
  } finally {
    rmSync(surface, { recursive: true, force: true });
  }
});

test("rejects unknown, missing, and duplicate options", () => {
  assert.throws(() => parseTarget(["project"]), /unknown argument: project/);
  assert.throws(
    () => parseTarget(["--unknown"]),
    /unknown argument: --unknown/,
  );
  assert.throws(() => parseTarget(["--target"]), /--target requires a value/);
  assert.throws(
    () => parseTarget(["--target", "first", "--target", "second"]),
    /--target may only be specified once/,
  );
});

test("runs the pinned package-local Codemod launcher with safe flags", () => {
  const launcher = resolveCodemodLauncher();
  assert.equal(
    launcher,
    resolve(dirname(require.resolve("codemod/package.json")), "codemod"),
  );
  const codemodPackage = require("codemod/package.json");
  assert.equal(codemodPackage.version, "1.12.13");
  assert.deepEqual(Object.keys(codemodPackage.optionalDependencies).sort(), [
    "@codemod.com/cli-darwin-arm64",
    "@codemod.com/cli-darwin-x64",
    "@codemod.com/cli-linux-arm64-gnu",
    "@codemod.com/cli-linux-x64-gnu",
    "@codemod.com/cli-win32-x64-msvc",
  ]);

  const target = resolve(packageDirectory, "example");
  assert.deepEqual(buildCodemodArguments(target), [
    "--disable-analytics",
    "workflow",
    "run",
    "-w",
    resolve(packageDirectory, "workflow.yaml"),
    "-t",
    target,
    "--allow-dirty",
    "--no-interactive",
  ]);
});

test("delegates runtime availability to the pinned Codemod launcher", () => {
  const target = resolve(packageDirectory, "example");
  let invocation;
  const result = runCodemod(target, {
    spawnImpl: (executable, argumentsList, options) => {
      invocation = { executable, argumentsList, options };
      return { status: 23 };
    },
  });

  assert.equal(result.status, 23);
  assert.equal(invocation.executable, process.execPath);
  assert.deepEqual(invocation.argumentsList, [
    resolveCodemodLauncher(),
    ...buildCodemodArguments(target),
  ]);
  assert.deepEqual(invocation.options, {
    cwd: packageDirectory,
    stdio: [0, 2, 1],
  });
  assert.equal(Object.hasOwn(invocation.options, "env"), false);
});

test("does not reject platforms before invoking Codemod", () => {
  let receivedTarget;
  const result = captureMain([], {
    cwd: packageDirectory,
    platform: "assistant-does-not-preflight-this",
    architecture: "assistant-does-not-preflight-this",
    glibcVersionRuntime: undefined,
    runImpl: (target) => {
      receivedTarget = target;
      return { status: 0 };
    },
  });

  assert.equal(result.status, 0);
  assert.equal(receivedTarget, packageDirectory);
  assertFinalDisclosure(result.diagnostics);
});

test("publishes exact immutable public-preview disclosure", () => {
  const packageJson = require("../package.json");
  assert.match(DISCLOSURE, /Final disclosure/);
  assert.ok(
    DISCLOSURE.includes(`Analyzer: ${packageJson.name}@${packageJson.version}`),
  );
  assert.match(DISCLOSURE, /solid-js@2\.0\.0-rc\.21/);
  assert.match(DISCLOSURE, /2105ffb8ca2fced55f5fac0763177fc93f97c2c2/);
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
  assert.match(DISCLOSURE, /github\.com\/solidjs\/solid\/blob\/2105ffb8/);
  assert.match(
    DISCLOSURE,
    /github\.com\/devagrawal09\/solid-migration-assistant\/issues/,
  );
  assert.match(DISCLOSURE, /End final disclosure$/);
});

test("ends successful, nonzero, and thrown engine invocations with disclosure", () => {
  for (const childStatus of [0, 23]) {
    const result = captureMain([], {
      cwd: packageDirectory,
      runImpl: () => ({ status: childStatus }),
    });
    assert.equal(result.status, childStatus);
    assert.deepEqual(result.diagnostics, [DISCLOSURE]);
    assertFinalDisclosure(result.diagnostics);
  }

  const thrown = captureMain([], {
    cwd: packageDirectory,
    runImpl: () => {
      throw new Error("engine unavailable");
    },
  });
  assert.equal(thrown.status, 1);
  assert.deepEqual(thrown.diagnostics, [
    "[solid-migration-assistant] analyzer execution failed: engine unavailable",
    DISCLOSURE,
  ]);
  assertFinalDisclosure(thrown.diagnostics);
});

test("ends usage and target failures with disclosure", () => {
  const surface = mkdtempSync(join(tmpdir(), "sma-cli-target-test-"));
  const fileTarget = join(surface, "file-target");
  writeFileSync(fileTarget, "not a directory\n");

  try {
    const cases = [
      {
        argumentsList: ["--unknown"],
        expected: "[solid-migration-assistant] unknown argument: --unknown",
      },
      {
        argumentsList: ["--target", "missing"],
        expected: `[solid-migration-assistant] target does not exist: ${join(surface, "missing")}`,
      },
      {
        argumentsList: ["--target", fileTarget],
        expected: `[solid-migration-assistant] target is not a directory: ${fileTarget}`,
      },
    ];

    for (const { argumentsList, expected } of cases) {
      const result = captureMain(argumentsList, {
        cwd: surface,
        runImpl: () => assert.fail("must not launch Codemod"),
      });
      assert.equal(result.status, 2);
      assert.deepEqual(result.diagnostics, [expected, DISCLOSURE]);
      assertFinalDisclosure(result.diagnostics);
    }
  } finally {
    rmSync(surface, { recursive: true, force: true });
  }
});

function captureMain(argumentsList, options) {
  const diagnostics = [];
  const originalError = console.error;
  console.error = (...values) => diagnostics.push(values.join(" "));
  try {
    return { status: main(argumentsList, options), diagnostics };
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
