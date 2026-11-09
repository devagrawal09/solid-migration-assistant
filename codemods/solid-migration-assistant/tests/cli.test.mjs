import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import {
  buildCodemodArguments,
  buildAgentReport,
  buildJsonReport,
  DISCLOSURE,
  parseStepOutput,
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
  assert.deepEqual(parseArguments([]), { workflow: "analyze", target: ".", allowDirty: false, format: "text" });
  assert.deepEqual(parseArguments(["analyze", "--target", "p"]), { workflow: "analyze", target: "p", allowDirty: false, format: "text" });
  assert.deepEqual(parseArguments(["transform"]), { workflow: "transform", target: ".", allowDirty: false, format: "text" });
  assert.deepEqual(parseArguments(["transform", "--allow-dirty", "--target", "p"]), { workflow: "transform", target: "p", allowDirty: true, format: "text" });
  assert.deepEqual(parseArguments(["--format", "json"]), { workflow: "analyze", target: ".", allowDirty: false, format: "json" });
  assert.throws(() => parseArguments(["--format", "xml"]), /--format requires one of: text, json/);
  assert.throws(() => parseArguments(["--format"]), /--format requires one of/);
  assert.throws(() => parseArguments(["--format", "json", "--format", "text"]), /--format may only be specified once/);
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
    writeFileSync(join(legacy, "package.json"), JSON.stringify({ dependencies: { "solid-js": "^1.9.3", "@solidjs/router": "^0.15.3", "@solidjs/testing-library": "^1.0.0-rc.2", "@tanstack/solid-query": "catalog:" }, devDependencies: { "vite-plugin-solid": "^2.11.0", "@kobalte/core": "^0.13.7" } }, null, 2));
    writeFileSync(join(legacy, "tsconfig.json"), '{\n  // comment\n  "compilerOptions": { "jsx": "preserve", "jsxImportSource": "solid-js", },\n}\n');
    const findings = projectFindings(legacy);
    // The solid-js finding, then one finding per mapped dependency at its own
    // line (sorted by line), then tsconfig. The testing-library range is
    // already on its Solid 2 line, so it is not reported; the catalog: range
    // cannot be compared and is reported with a note.
    assert.deepEqual(
      findings.map((finding) => finding.split("\n")[0]),
      [
        "package.json:1:1 Manual review required: move this project's Solid dependencies to solid-js@2.0.0-rc.21.",
        "package.json:4:5 Manual review required: move @solidjs/router to its Solid 2 line.",
        "package.json:6:5 Manual review required: move @tanstack/solid-query to its Solid 2 line.",
        "package.json:9:5 Manual review required: replace vite-plugin-solid with its Solid 2 successor.",
        "package.json:10:5 Manual review required: resolve @kobalte/core, which has no Solid 2 release yet.",
        "tsconfig.json:1:1 Manual review required: point jsxImportSource at the Solid 2 renderer package.",
      ],
    );
    assert.match(findings[0], /declared as "\^1\.9\.3", a Solid 1 range; @solidjs\/web, the Solid 2 web renderer package, is not declared\./);
    assert.match(findings[2], /"catalog:" could not be compared/);
    assert.match(findings[4], /pins solid-js and @solidjs\/web to exactly 2\.0\.0-rc\.16/);
    assert.match(findings[5], /Official migration guide: https:\/\/github\.com\/solidjs\/solid\/blob\/2105ffb8ca2fced55f5fac0763177fc93f97c2c2\/documentation\/solid-2\.0\/MIGRATION\.md#typescript-jsx-solid-js--renderer-package/);

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
    assert.match(printed[0], /\n\npackage\.json:4:5 Manual review required: move @solidjs\/router/);
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

test("--format json re-emits captured findings as one sorted, tiered JSON document", () => {
  const guide = "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md";
  const stepOutput = [
    "Workflow started 00000000-0000-0000-0000-000000000000",
    "src/last-file-codemod-prints.tsx",
    `  src/b.tsx:4:2 Manual review required: migrate this lowercase onclick attribute to a camelCase event handler.`,
    `  Why: plain attribute now. Official migration guide: ${guide}#attributes`,
    "  ",
    `  src/a.tsx:2:1 Move this Solid web renderer static import.`,
    `  Guidance: move it. Official migration guide: ${guide}#imports`,
    "  ",
    "  [solid-migration-assistant] Summary: 2 findings in 2 file(s)",
    "  Will not build or run on Solid 2: 1 findings",
    "     1  Move this Solid web renderer static import.",
  ].join("\n");
  const findings = parseStepOutput(stepOutput, "analyze");
  assert.deepEqual(findings.map(({ file, line, column }) => `${file}:${line}:${column}`), ["src/b.tsx:4:2", "src/a.tsx:2:1"]);
  assert.equal(findings[1].guide, `${guide}#imports`);

  const report = buildJsonReport({ workflow: "analyze", target: "/t", entries: findings, status: 0 });
  assert.equal(report.solid.target, "solid-js@2.0.0-rc.21");
  assert.deepEqual(report.summary, { findings: 2, files: 2, bySeverity: { build: 1, behavior: 1, deprecated: 0 } });
  assert.deepEqual(report.findings.map((finding) => [finding.file, finding.severity]), [["src/a.tsx", "build"], ["src/b.tsx", "behavior"]]);

  const rewrites = parseStepOutput(
    `  src/x.tsx:1:15 Relocate solid-js/h to @solidjs/h. Official migration guide: ${guide}#imports\n  src/x.tsx:3:5 Rewrite the classList attribute on <div> to class, preserving its value expression. Official migration guide: ${guide}#classlist\n`,
    "transform",
  );
  const transformReport = buildJsonReport({ workflow: "transform", target: "/t", entries: rewrites, status: 0 });
  assert.deepEqual(transformReport.summary, { rewrites: 2, files: 1 });
  assert.equal(transformReport.rewrites[0].message, "Relocate solid-js/h to @solidjs/h.");
  assert.equal(transformReport.rewrites[1].guide, `${guide}#classlist`);

  const printed = [];
  const originalLog = console.log;
  console.log = (...values) => printed.push(values.join(" "));
  let options;
  try {
    const result = captureMain(["--format", "json"], {
      cwd: packageDirectory,
      projectImpl: () => [],
      runImpl: (target, workflow, runOptions) => {
        options = runOptions;
        return { status: 0, stderr: stepOutput };
      },
    });
    assert.equal(result.status, 0);
    assert.deepEqual(result.diagnostics, [DISCLOSURE]);
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(options, { capture: true });
  assert.equal(printed.length, 1, "JSON mode prints exactly one document on stdout");
  assert.equal(JSON.parse(printed[0]).summary.findings, 2);
});

test("--format agent prints a fix-ordered Markdown work list and is analyze-only", () => {
  assert.throws(() => parseArguments(["transform", "--format", "agent"]), /--format agent is only accepted with the analyze workflow/);
  const finding = (file, line, headline, severity) => ({
    file,
    line,
    column: 1,
    headline,
    severity,
    guide: null,
    text: `${file}:${line}:1 ${headline}\nWhy: because.\nGuidance: do it.`,
  });
  const markdown = buildAgentReport({
    tool: "solid-migration-assistant",
    version: "0.0.0",
    solid: { target: "solid-js@2.0.0-rc.21", sourceCommit: "c".repeat(40) },
    target: "/app",
    summary: { findings: 3, files: 2, bySeverity: { build: 1, behavior: 1, deprecated: 1 } },
    findings: [
      finding("src/b.tsx", 9, "Behavior headline.", "behavior"),
      finding("src/b.tsx", 2, "Deprecated headline.", "deprecated"),
      finding("src/a.tsx", 5, "Build headline.", "build"),
    ],
  });
  const tasks = markdown.split("\n").filter((line) => line.startsWith("- [ ] "));
  assert.deepEqual(tasks, [
    "- [ ] `src/a.tsx:5:1` Build headline. *(Will not build or run on Solid 2)*",
    "- [ ] `src/b.tsx:9:1` Behavior headline. *(Builds but behaves differently)*",
    "- [ ] `src/b.tsx:2:1` Deprecated headline. *(Deprecated but still working)*",
  ]);
  assert.match(markdown, /^# Solid 2 migration tasks/);
  assert.match(markdown, /\n  Why: because\.\n  Guidance: do it\./);
  assert.match(markdown, /--format agent --target \/app`/);
  assert.ok(markdown.indexOf("## `src/a.tsx`") < markdown.indexOf("## `src/b.tsx`"), "files with build-tier tasks come first");
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
