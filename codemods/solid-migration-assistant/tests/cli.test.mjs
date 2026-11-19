import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  buildCodemodArguments,
  buildAgentReport,
  buildJsonReport,
  DISCLOSURE,
  parseRunOutput,
  dirtyTreeReason,
  main,
  nextSteps,
  parseArguments,
  parseTarget,
  projectFindings,
  resolveCodemodLauncher,
  runCodemod,
} from "../shared/run-workflow.mjs";

const packageDirectory = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

test("defaults the target to the invocation directory", async () => {
  assert.equal(parseTarget([]), ".");
  assert.equal(parseTarget(["--target", "project"]), "project");
});

test("parses the optional workflow and the transform-only --allow-dirty flag", async () => {
  assert.deepEqual(parseArguments([]), { workflow: "analyze", target: ".", allowDirty: false, allowBlocked: false, install: true, offline: false, verbose: false, format: "text" });
  assert.deepEqual(parseArguments(["analyze", "--target", "p"]), { workflow: "analyze", target: "p", allowDirty: false, allowBlocked: false, install: true, offline: false, verbose: false, format: "text" });
  assert.deepEqual(parseArguments(["transform"]), { workflow: "transform", target: ".", allowDirty: false, allowBlocked: false, install: true, offline: false, verbose: false, format: "text" });
  assert.deepEqual(parseArguments(["transform", "--allow-dirty", "--target", "p"]), { workflow: "transform", target: "p", allowDirty: true, allowBlocked: false, install: true, offline: false, verbose: false, format: "text" });
  assert.deepEqual(parseArguments(["--format", "json"]), { workflow: "analyze", target: ".", allowDirty: false, allowBlocked: false, install: true, offline: false, verbose: false, format: "json" });
  assert.throws(() => parseArguments(["--format", "xml"]), /--format requires one of: text, json/);
  assert.throws(() => parseArguments(["--format"]), /--format requires one of/);
  assert.throws(() => parseArguments(["--format", "json", "--format", "text"]), /--format may only be specified once/);
  assert.throws(() => parseArguments(["--allow-dirty"]), /only accepted with the transform workflow/);
  assert.throws(() => parseArguments(["analyze", "--allow-dirty"]), /only accepted with the transform workflow/);
  assert.ok(buildCodemodArguments("/t", "transform").includes("mode=migrate"));
  assert.equal(parseArguments(["transform", "--allow-blocked"]).allowBlocked, true);
  assert.equal(parseArguments(["transform", "--verbose"]).verbose, true);
  assert.throws(() => parseArguments(["--allow-blocked"]), /only accepted with the transform workflow/);
  assert.equal(buildCodemodArguments("/t", "transform", { allowBlocked: true }).at(-1), "--approve");
});

test("--no-install, accepted only with transform, tells the workflow not to install", () => {
  assert.equal(parseArguments(["transform", "--no-install"]).install, false);
  assert.throws(() => parseArguments(["--no-install"]), /only accepted with the transform workflow/);
  assert.equal(buildCodemodArguments("/t", "transform", { install: false }).join(" ").includes("--param install=false"), true);
});

test("refuses to transform a dirty or non-git target unless --allow-dirty", async () => {
  const spawnFor = (result) => () => result;
  assert.equal(dirtyTreeReason("/t", { spawnImpl: spawnFor({ status: 0, stdout: "" }) }), null);
  assert.match(dirtyTreeReason("/t", { spawnImpl: spawnFor({ status: 0, stdout: " M a.ts\n?? b.ts\n" }) }), /2 uncommitted change/);
  assert.match(dirtyTreeReason("/t", { spawnImpl: spawnFor({ status: 128, stdout: "" }) }), /not inside a git repository/);
  assert.match(dirtyTreeReason("/t", { spawnImpl: spawnFor({ error: new Error("ENOENT") }) }), /not inside a git repository/);

  const blocked = await captureMain(["transform"], {
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
  const allowed = await captureMain(["transform", "--allow-dirty"], {
    cwd: packageDirectory,
    dirtyImpl: () => assert.fail("--allow-dirty must skip the git check"),
    runImpl: (target, workflow) => {
      launched = { target, workflow };
      return { status: 0 };
    },
  });
  assert.equal(allowed.status, 0);
  assert.deepEqual(launched, { target: packageDirectory, workflow: "transform" });

  const clean = await captureMain(["transform"], {
    cwd: packageDirectory,
    dirtyImpl: () => null,
    runImpl: (target, workflow) => ({ status: workflow === "transform" ? 0 : 9 }),
  });
  assert.equal(clean.status, 0);
});

test("reports Solid 1 manifests and jsxImportSource read-only, before the analyzer runs", async () => {
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
      findings.map((finding) => `${finding.file}:${finding.line}:${finding.column} [${finding.severity}] ${finding.rule} ${finding.headline}`),
      [
        "package.json:1:1 [build] project/solid-version Move this project's Solid dependencies to solid-js@2.0.1.",
        "package.json:4:5 [build] project/dependencies Move @solidjs/router to its Solid 2 line.",
        "package.json:6:5 [build] project/dependencies Move @tanstack/solid-query to its Solid 2 line.",
        "package.json:9:5 [build] project/dependencies Replace vite-plugin-solid with its Solid 2 successor.",
        "package.json:10:5 [build] project/dependencies Resolve @kobalte/core, which has no Solid 2 release yet.",
        "tsconfig.json:1:1 [build] project/jsx-import-source Point jsxImportSource at the Solid 2 renderer package.",
      ],
    );
    assert.match(findings[0].why, /declared as "\^1\.9\.3", a Solid 1 range; @solidjs\/web, the Solid 2 web renderer package, is not declared\./);
    assert.match(findings[2].why, /"catalog:" could not be compared/);
    assert.match(findings[4].guidance, /pins solid-js and @solidjs\/web to exactly 2\.0\.0-rc\.16/);
    assert.equal(findings[5].guide, "https://github.com/solidjs/solid/blob/82f71fddb1340cab46167db119da5702038e65ab/documentation/solid-2.0/MIGRATION.md#typescript-jsx-solid-js--renderer-package");

    const migrated = join(surface, "migrated");
    mkdirSync(migrated);
    writeFileSync(join(migrated, "package.json"), JSON.stringify({ dependencies: { "solid-js": "2.0.1", "@solidjs/web": "2.0.1" } }));
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
      const result = await captureMain(["--target", legacy], {
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
    assert.match(printed[0], /^\[solid-migration-assistant\] 6 findings for Solid 2\.0\.1\./);
    assert.match(printed[0], /\n\npackage\.json:1:1 \[build\] Move this project's Solid dependencies/);
    assert.match(printed[0], /\n\npackage\.json:4:5 \[build\] Move @solidjs\/router to its Solid 2 line\.\n  Rule: project\/dependencies\n/);
    assert.match(printed[0], /\n\ntsconfig\.json:1:1 /);
    assert.match(printed[0], /\[solid-migration-assistant\] Summary: 6 findings in 2 files\nWill not build or run on Solid 2: 6 findings\n/);

  } finally {
    rmSync(surface, { recursive: true, force: true });
  }
});

test("transform lists the dependencies it could not move as leftovers, read after its rewrites", async () => {
  const root = projectTree({ "package.json": { dependencies: { "solid-js": "^1.9.0", "solid-icons": "^1.1.0" } } });
  const printed = [];
  const originalLog = console.log;
  console.log = (...values) => printed.push(values.join(" "));
  try {
    await captureMain(["transform", "--allow-dirty", "--no-install", "--target", root], {
      cwd: root,
      runImpl: () => {
        writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { "solid-js": "2.0.1", "@solidjs/web": "2.0.1", "solid-icons": "^1.1.0" } }));
        return { status: 0, output: { findings: [], rewrites: [] } };
      },
    });
  } finally {
    console.log = originalLog;
    rmSync(root, { recursive: true, force: true });
  }
  const headlines = [...printed.join("\n").matchAll(/^package\.json:\d+:\d+ \[\w+\] (.*)$/gm)].map((match) => match[1]);
  assert.deepEqual(headlines, ["Resolve solid-icons, which has no Solid 2 release yet."]);
});

const GUIDE = "https://github.com/solidjs/solid/blob/82f71fddb1340cab46167db119da5702038e65ab/documentation/solid-2.0/MIGRATION.md";

function fakeFinding(file, line, headline, severity, rule = "jsx/example") {
  return { rule, file, line, column: 1, severity, headline, why: "Because.", guidance: "Do it.", lint: [], guide: `${GUIDE}#x` };
}

test("--format json re-emits the workflow's report as one sorted, tiered JSON document", async () => {
  const output = {
    findings: [fakeFinding("src/b.tsx", 4, "Behavior headline.", "behavior"), fakeFinding("src/a.tsx", 2, "Build headline.", "build")],
    rewrites: [],
    failures: [{ step: "JSX: analyzeExample", path: "src/c.tsx", error: "TypeError: boom" }],
  };
  const parsed = parseRunOutput({ output });
  assert.deepEqual(parsed.findings, output.findings);
  assert.deepEqual(parsed.diagnostics, ["JSX: analyzeExample: src/c.tsx: TypeError: boom"]);
  assert.deepEqual(parseRunOutput({ output: { skipped: "solid-js is not a dependency of this project" } }), {
    findings: [], rewrites: [], dependencySkips: [], afterMigrate: undefined, diagnostics: ["[solid-migration-assistant] skipped: solid-js is not a dependency of this project"],
  });

  const report = buildJsonReport({ workflow: "analyze", target: "/t", findings: parsed.findings, status: 0 });
  assert.equal(report.solid.target, "solid-js@2.0.1");
  assert.deepEqual(report.summary, { findings: 2, files: 2, bySeverity: { build: 1, behavior: 1, deprecated: 0 }, byRule: { "jsx/example": 2 } });
  assert.deepEqual(report.findings.map((finding) => [finding.file, finding.severity]), [["src/a.tsx", "build"], ["src/b.tsx", "behavior"]]);

  const rewrite = (file, line, message) => ({ rule: "imports/example", file, line, column: 1, message, guide: `${GUIDE}#imports` });
  const transformReport = buildJsonReport({
    workflow: "transform",
    target: "/t",
    rewrites: [rewrite("src/x.tsx", 3, "Second."), rewrite("src/x.tsx", 1, "First.")],
    status: 0,
  });
  assert.deepEqual(transformReport.summary, { rewrites: 2, files: 1, byRule: { "imports/example": 2 } });
  assert.deepEqual(transformReport.rewrites.map((entry) => entry.message), ["First.", "Second."]);

  const printed = [];
  const originalLog = console.log;
  console.log = (...values) => printed.push(values.join(" "));
  let result;
  try {
    result = await captureMain(["--format", "json"], {
      cwd: packageDirectory,
      projectImpl: () => [],
      runImpl: () => ({ status: 0, output }),
    });
  } finally {
    console.log = originalLog;
  }
  assert.equal(result.status, 0);
  // Failed files are printed to stderr after the run.
  assert.deepEqual(result.diagnostics, [parsed.diagnostics.join("\n"), DISCLOSURE]);
  assert.equal(printed.length, 1, "JSON mode prints exactly one document on stdout");
  assert.equal(JSON.parse(printed[0]).summary.findings, 2);
});

test("--format agent prints a fix-ordered Markdown work list and is analyze-only", async () => {
  assert.throws(() => parseArguments(["transform", "--format", "agent"]), /--format agent is only accepted with the analyze workflow/);
  const markdown = buildAgentReport({
    tool: "solid-migration-assistant",
    version: "0.0.0",
    solid: { target: "solid-js@2.0.1", sourceCommit: "c".repeat(40) },
    target: "/app",
    summary: { findings: 3, files: 2, bySeverity: { build: 1, behavior: 1, deprecated: 1 } },
    findings: [
      fakeFinding("src/b.tsx", 9, "Behavior headline.", "behavior"),
      fakeFinding("src/b.tsx", 2, "Deprecated headline.", "deprecated"),
      { ...fakeFinding("src/a.tsx", 5, "Build headline.", "build"), lint: ["removed-api"] },
    ],
  });
  const tasks = markdown.split("\n").filter((line) => line.startsWith("- [ ] "));
  assert.deepEqual(tasks, [
    "- [ ] `src/a.tsx:5:1` Build headline. *(Will not build or run on Solid 2; jsx/example)*",
    "- [ ] `src/b.tsx:9:1` Behavior headline. *(Builds but behaves differently; jsx/example)*",
    "- [ ] `src/b.tsx:2:1` Deprecated headline. *(Deprecated but still working; jsx/example)*",
  ]);
  assert.match(markdown, /^# Solid 2 migration tasks/);
  assert.match(markdown, /\n  Why: Because\.\n  Guidance: Do it\.\n  Lint: eslint-plugin-solid's solid\/removed-api \(v2 config\) keeps reporting this site after migration\.\n  Guide: /);
  assert.match(markdown, /--format agent --target \/app`/);
  assert.ok(markdown.indexOf("## `src/a.tsx`") < markdown.indexOf("## `src/b.tsx`"), "files with build-tier tasks come first");
});

test("rejects unknown, missing, and duplicate options", async () => {
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

test("runs the pinned package-local Codemod launcher with safe flags", async () => {
  const launcher = resolveCodemodLauncher();
  assert.equal(
    launcher,
    resolve(dirname(require.resolve("codemod/package.json")), "codemod"),
  );
  const codemodPackage = require("codemod/package.json");
  assert.equal(codemodPackage.version, "2.0.0-alpha.4");
  assert.deepEqual(Object.keys(codemodPackage.optionalDependencies).sort(), [
    "@codemod.com/cli-darwin-arm64",
    "@codemod.com/cli-darwin-x64",
    "@codemod.com/cli-linux-arm64-gnu",
    "@codemod.com/cli-linux-arm64-musl",
    "@codemod.com/cli-linux-x64-gnu",
    "@codemod.com/cli-linux-x64-musl",
    "@codemod.com/cli-win32-x64-msvc",
  ]);

  const target = resolve(packageDirectory, "example");
  assert.deepEqual(buildCodemodArguments(target), [
    "--disable-analytics",
    "workflow",
    "run",
    "-w",
    packageDirectory,
    "-t",
    target,
    "--allow-dirty",
    "--no-interactive",
    "--param",
    "mode=analyze",
    "--param",
    "verify=false",
    "--param",
    "report=none",
  ]);
});

function fakeChild(stderrChunks, status) {
  const child = new EventEmitter();
  child.stderr = new PassThrough();
  setImmediate(() => {
    for (const chunk of stderrChunks) child.stderr.write(chunk);
    child.stderr.end();
    child.emit("close", status);
  });
  return child;
}

const progressSink = () => {
  const sink = { text: "", write: (chunk) => { sink.text += chunk; } };
  return sink;
};

test("delegates runtime availability to the pinned Codemod launcher", async () => {
  const target = resolve(packageDirectory, "example");
  let invocation;
  const result = await runCodemod(target, {
    progress: progressSink(),
    spawnImpl: (executable, argumentsList, options) => {
      invocation = { executable, argumentsList, options };
      return fakeChild([], 23);
    },
  });

  assert.equal(result.status, 23);
  assert.equal(invocation.executable, process.execPath);
  assert.deepEqual(invocation.argumentsList, [
    resolveCodemodLauncher(),
    ...buildCodemodArguments(target),
  ]);
  // The run record goes to a temporary directory that is removed after the run.
  const { env, ...options } = invocation.options;
  assert.deepEqual(options, { cwd: packageDirectory, stdio: [0, 2, "pipe"] });
  assert.equal(existsSync(env.CODEMOD_RUN_STORE_DIR), false);
});

const stepLog = ["Run 61a770f9-71d9\n▸ jsx/cla", "ss-list\n✓ jsx/class-list (2.1s)\n▸ Stores: unwrap\n✓ Stores: unwrap (0.0s)\nDone\n"];
const clock = (...times) => () => times.shift();

const colored = (chunks) => chunks.map((chunk) => chunk.replace(/^(▸|✓|Run|Done)/gm, "\u001b[2m$1\u001b[0m"));

for (const [name, log] of [["plain", stepLog], ["colored", colored(stepLog)]]) {
  test(`folds Codemod's ${name} step lines into one closing line`, async () => {
    const progress = progressSink();
    await runCodemod(packageDirectory, { progress, now: clock(1000, 3400), spawnImpl: () => fakeChild(log, 0) });
    assert.equal(progress.text, "[solid-migration-assistant] Ran 2 workflow steps in 2.4s.\n");
  });
}

test("shows the running step in place on a terminal and clears it before other output", async () => {
  const progress = Object.assign(progressSink(), { isTTY: true });
  await runCodemod(packageDirectory, { progress, now: clock(0, 100), spawnImpl: () => fakeChild(["▸ Install\nnpm ERR! 404\n✓ Install (9.0s)\n"], 0) });
  assert.equal(progress.text, "\r\x1b[K▸ Install\r\x1b[Knpm ERR! 404\n[solid-migration-assistant] Ran 1 workflow step in 0.1s.\n");
});

test("streams every Codemod line with --verbose", async () => {
  const progress = progressSink();
  await runCodemod(packageDirectory, { progress, verbose: true, spawnImpl: () => fakeChild(stepLog, 0) });
  assert.equal(progress.text, stepLog.join(""));
});

test("drops Codemod's resume hint, whose run store is gone after the run", async () => {
  const progress = progressSink();
  const pause = "Waiting for approval: @kobalte/core has no Solid 2 release. Apply the source rewrites anyway?\n  Resume with: codemod workflow resume --id 1 --approve\n";
  await runCodemod(packageDirectory, { progress, spawnImpl: () => fakeChild([pause], 0) });
  assert.equal(progress.text, "");
});

test("does not reject platforms before invoking Codemod", async () => {
  let receivedTarget;
  const result = await captureMain([], {
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

test("publishes exact immutable public-preview disclosure", async () => {
  const packageJson = require("../package.json");
  assert.match(DISCLOSURE, /Final disclosure/);
  assert.ok(
    DISCLOSURE.includes(`Analyzer: ${packageJson.name}@${packageJson.version}`),
  );
  assert.match(DISCLOSURE, /solid-js@2\.0\.1/);
  assert.match(DISCLOSURE, /82f71fddb1340cab46167db119da5702038e65ab/);
  assert.match(
    DISCLOSURE,
    /source-only.*incomplete.*no migration-readiness claim/is,
  );
  assert.match(DISCLOSURE, /analyze is read-only and runs nothing in the target/);
  assert.match(DISCLOSURE, /transform .* installs with the project's package manager.*--no-install skips it.*typechecks/);
  assert.match(
    DISCLOSURE,
    /only the exact destination above; other Solid versions are unsupported/,
  );
  assert.match(DISCLOSURE, /no analyzer telemetry or generated report/);
  assert.match(DISCLOSURE, /Codemod may retain normal workflow or task state/);
  assert.match(DISCLOSURE, /github\.com\/solidjs\/solid\/blob\/82f71fdd/);
  assert.match(
    DISCLOSURE,
    /github\.com\/devagrawal09\/solid-migration-assistant\/issues/,
  );
  assert.match(DISCLOSURE, /End final disclosure$/);
});

test("ends successful, nonzero, and thrown engine invocations with disclosure", async () => {
  for (const childStatus of [0, 23]) {
    const result = await captureMain([], {
      cwd: packageDirectory,
      runImpl: () => ({ status: childStatus }),
    });
    assert.equal(result.status, childStatus);
    assert.deepEqual(result.diagnostics, [DISCLOSURE]);
    assertFinalDisclosure(result.diagnostics);
  }

  const thrown = await captureMain([], {
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

test("ends usage and target failures with disclosure", async () => {
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
      const result = await captureMain(argumentsList, {
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

async function captureMain(argumentsList, options) {
  const diagnostics = [];
  const originalError = console.error;
  console.error = (...values) => diagnostics.push(values.join(" "));
  try {
    return { status: await main(argumentsList, options), diagnostics };
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

const paused = {
  status: 0,
  runStatus: "awaiting-approval",
  output: undefined,
  awaiting: "@kobalte/core has no Solid 2 release. Apply the source rewrites anyway?",
};

test("stops a transform that a dependency without a Solid 2 release paused", async () => {
  const result = await captureMain(["transform", "--allow-dirty"], { cwd: packageDirectory, runImpl: () => paused });
  assert.equal(result.status, 2);
});

test("names the blocked dependency and not the resume hint when a transform pauses", async () => {
  const result = await captureMain(["transform", "--allow-dirty"], { cwd: packageDirectory, runImpl: () => paused });
  assert.equal(
    result.diagnostics[0],
    "[solid-migration-assistant] nothing was rewritten. @kobalte/core has no Solid 2 release. Pass --allow-blocked to apply the source rewrites anyway.",
  );
});

test("after a skipped install, tells the user to install and then typecheck", () => {
  assert.match(nextSteps({ afterMigrate: { install: { skipped: "--no-install" }, typecheck: [] } })[0], /^Install with your package manager, then typecheck/);
});

test("after a skipped install, says what targets Solid 2 only when migrate moved solid-js", () => {
  const afterMigrate = { install: { skipped: "--no-install" }, typecheck: [] };
  const moved = [{ rule: "project/dependencies", message: "Move solid-js from ^1.9.5 to ^2.0.1." }];
  const movedInCatalog = [{ ...moved[0], file: "pnpm-workspace.yaml", message: "Move solid-js from ^1.9.5 to ^2.0.1 in the default catalog." }];
  assert.deepEqual(
    [nextSteps({ afterMigrate, rewrites: moved })[0], nextSteps({ afterMigrate, rewrites: movedInCatalog })[0], nextSteps({ afterMigrate })[0]],
    [
      "Install with your package manager, then typecheck: package.json now targets Solid 2.0.1.",
      "Install with your package manager, then typecheck: the workspace catalog now targets Solid 2.0.1.",
      "Install with your package manager, then typecheck.",
    ],
  );
});

test("after a failed install, names the command and where to run it again", () => {
  const afterMigrate = { install: { command: "pnpm install", directory: ".", ok: false, error: "ERR_PNPM_PEER_DEP_ISSUES" }, typecheck: [] };
  assert.match(nextSteps({ afterMigrate })[0], /^Run pnpm install in the project root once the install error above is fixed/);
});

function projectTree(files) {
  const root = mkdtempSync(join(tmpdir(), "sma-project-"));
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value, null, 2));
  }
  return root;
}

const projectSites = (files) => {
  const root = projectTree(files);
  try {
    return projectFindings(root).map((finding) => `${finding.file} ${finding.headline}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("reports the Solid version of every workspace package, not only the root", async () => {
  assert.deepEqual(projectSites({
    "package.json": { private: true, workspaces: ["packages/*"] },
    "packages/app/package.json": { dependencies: { "solid-js": "^1.9.5", "@solidjs/web": "2.0.1" } },
  }), ["packages/app/package.json Move this project's Solid dependencies to solid-js@2.0.1."]);
});

test("reads solid-js through the pnpm catalog", async () => {
  assert.deepEqual(projectSites({
    "pnpm-workspace.yaml": "packages:\n  - packages/*\ncatalog:\n  solid-js: ^2.0.0\n  \"@solidjs/web\": ^2.0.0\n",
    "packages/app/package.json": { dependencies: { "solid-js": "catalog:", "@solidjs/web": "catalog:" } },
  }), []);
});

test("reports jsxImportSource in a workspace package's tsconfig.json", async () => {
  assert.deepEqual(projectSites({ "packages/app/tsconfig.json": { compilerOptions: { jsxImportSource: "solid-js" } } }), [
    "packages/app/tsconfig.json Point jsxImportSource at the Solid 2 renderer package.",
  ]);
});

test("reports jsxImportSource in any tsconfig a project splits its settings into", async () => {
  assert.deepEqual(projectSites({ "tsconfig.app.json": { compilerOptions: { jsxImportSource: "solid-js" } } }), [
    "tsconfig.app.json Point jsxImportSource at the Solid 2 renderer package.",
  ]);
});

test("reads no manifest inside node_modules, even outside git", async () => {
  assert.deepEqual(projectSites({
    "package.json": { dependencies: { "solid-js": "^2.0.1", "@solidjs/web": "^2.0.1" } },
    "node_modules/old-lib/package.json": { dependencies: { "solid-js": "^1.9.5" } },
  }), []);
});

test("says when a solid-js range names no version it can compare", async () => {
  const root = projectTree({ "package.json": { dependencies: { "solid-js": "latest" } } });
  try {
    assert.match(projectFindings(root)[0].why, /"latest", which this analyzer can't compare with Solid 2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports an installed library whose solid-js peer range rules out Solid 2", async () => {
  assert.deepEqual(projectSites({
    "package.json": { dependencies: { "solid-navigator": "^0.4.0" } },
    "node_modules/solid-navigator/package.json": { version: "0.4.2", peerDependencies: { "solid-js": "^1.6.0" } },
  }), ["package.json Check that solid-navigator supports Solid 2."]);
});

test("trusts an installed library whose solid-js peer range allows Solid 2", async () => {
  assert.deepEqual(projectSites({
    "package.json": { dependencies: { "solid-navigator": "^1.0.0" } },
    "node_modules/solid-navigator/package.json": { peerDependencies: { "solid-js": "^1.8.0 || ^2.0.0-0" } },
  }), []);
});

test("skips a dependency on another workspace package", async () => {
  assert.deepEqual(projectSites({
    "packages/ui/package.json": { name: "@app/solid-ui" },
    "packages/app/package.json": { dependencies: { "@app/solid-ui": "^1.0.0" } },
  }), []);
});
