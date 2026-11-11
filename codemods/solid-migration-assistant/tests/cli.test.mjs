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
  declaredSolidVersion,
  DISCLOSURE,
  ecosystemPackageFromHeadline,
  filterEcosystemFindings,
  isSolid2Range,
  packagesOnSolid2Line,
  parseStepOutput,
  dirtyTreeReason,
  main,
  parseArguments,
  parseTarget,
  projectFindings,
  resolveCodemodLauncher,
  runCodemod,
  solid2Notice,
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
      findings.map((finding) => `${finding.file}:${finding.line}:${finding.column} [${finding.severity}] ${finding.rule} ${finding.headline}`),
      [
        "package.json:1:1 [build] project/solid-version Move this project's Solid dependencies to solid-js@2.0.0-rc.21.",
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
    assert.equal(findings[5].guide, "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#typescript-jsx-solid-js--renderer-package");

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
    assert.match(printed[0], /^\[solid-migration-assistant\] 6 findings for Solid 2\.0\.0-rc\.21\./);
    assert.match(printed[0], /\n\npackage\.json:1:1 \[build\] Move this project's Solid dependencies/);
    assert.match(printed[0], /\n\npackage\.json:4:5 \[build\] Move @solidjs\/router to its Solid 2 line\.\n  Rule: project\/dependencies\n/);
    assert.match(printed[0], /\n\ntsconfig\.json:1:1 /);
    assert.match(printed[0], /\[solid-migration-assistant\] Summary: 6 findings in 2 files\nWill not build or run on Solid 2: 6 findings\n/);

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

const GUIDE = "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md";

function fakeFinding(file, line, headline, severity, rule = "jsx/example") {
  return { rule, file, line, column: 1, severity, headline, why: "Because.", guidance: "Do it.", lint: [], guide: `${GUIDE}#x` };
}

test("--format json re-emits the workflow's report as one sorted, tiered JSON document", () => {
  const reported = {
    findings: [fakeFinding("src/b.tsx", 4, "Behavior headline.", "behavior"), fakeFinding("src/a.tsx", 2, "Build headline.", "build")],
    rewrites: [],
  };
  const stepOutput = [
    "src/last-file-codemod-prints.tsx",
    `  SMA-REPORT ${JSON.stringify(reported)}`,
    "  some rule printed this diagnostic",
  ].join("\n");
  const parsed = parseStepOutput(stepOutput);
  assert.deepEqual(parsed.findings, reported.findings);
  assert.deepEqual(parsed.diagnostics, ["src/last-file-codemod-prints.tsx", "  some rule printed this diagnostic"]);
  assert.deepEqual(parseStepOutput("no report line here"), { findings: [], rewrites: [], diagnostics: ["no report line here"] });

  const report = buildJsonReport({ workflow: "analyze", target: "/t", findings: parsed.findings, status: 0 });
  assert.equal(report.solid.target, "solid-js@2.0.0-rc.21");
  assert.deepEqual(report.summary, { findings: 2, files: 2, bySeverity: { build: 1, behavior: 1, deprecated: 0 } });
  assert.deepEqual(report.findings.map((finding) => [finding.file, finding.severity]), [["src/a.tsx", "build"], ["src/b.tsx", "behavior"]]);

  const rewrite = (file, line, message) => ({ rule: "imports/example", file, line, column: 1, message, guide: `${GUIDE}#imports` });
  const transformReport = buildJsonReport({
    workflow: "transform",
    target: "/t",
    rewrites: [rewrite("src/x.tsx", 3, "Second."), rewrite("src/x.tsx", 1, "First.")],
    status: 0,
  });
  assert.deepEqual(transformReport.summary, { rewrites: 2, files: 1 });
  assert.deepEqual(transformReport.rewrites.map((entry) => entry.message), ["First.", "Second."]);

  const printed = [];
  const originalLog = console.log;
  console.log = (...values) => printed.push(values.join(" "));
  let result;
  try {
    result = captureMain(["--format", "json"], {
      cwd: packageDirectory,
      projectImpl: () => [],
      runImpl: () => ({ status: 0, stderr: stepOutput }),
    });
  } finally {
    console.log = originalLog;
  }
  assert.equal(result.status, 0);
  // Step output other than the report line is passed through to stderr.
  assert.deepEqual(result.diagnostics, [parsed.diagnostics.join("\n"), DISCLOSURE]);
  assert.equal(printed.length, 1, "JSON mode prints exactly one document on stdout");
  assert.equal(JSON.parse(printed[0]).summary.findings, 2);
});

test("--format agent prints a fix-ordered Markdown work list and is analyze-only", () => {
  assert.throws(() => parseArguments(["transform", "--format", "agent"]), /--format agent is only accepted with the analyze workflow/);
  const markdown = buildAgentReport({
    tool: "solid-migration-assistant",
    version: "0.0.0",
    solid: { target: "solid-js@2.0.0-rc.21", sourceCommit: "c".repeat(40) },
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
    "--param",
    "format=json",
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
  // Progress goes to our stderr; step output is captured for the report line.
  assert.deepEqual(invocation.options, {
    cwd: packageDirectory,
    stdio: [0, 2, "pipe"],
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
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

test("drops ecosystem-apis findings for packages the manifest already pins to their Solid 2 line", () => {
  // The ecosystem-apis rule has no access to package.json. A project that
  // already upgraded its @solidjs/router or @solidjs/meta to the Solid 2
  // line still gets per-import findings from the rule; the launcher drops
  // them after collection so every output format agrees.
  assert.equal(ecosystemPackageFromHeadline("Migrate this A import from @solidjs/router, which Solid 2 removes or moves."), "@solidjs/router");
  assert.equal(ecosystemPackageFromHeadline("Review this Meta import from @solidjs/meta, whose Solid 2 behavior changed."), "@solidjs/meta");
  assert.equal(ecosystemPackageFromHeadline("Replace this deprecated action import from @solidjs/router."), "@solidjs/router");
  assert.equal(ecosystemPackageFromHeadline("Migrate this @solidjs/start/config import, which has no Solid 2 release."), "@solidjs/start/config");
  assert.equal(ecosystemPackageFromHeadline("Split this one-argument createEffect into compute and apply callbacks (simple shape)."), null);

  // The DEPENDENCY_MAP table decides which range counts as the Solid 2
  // line; router asks for 2.0.0-next.*, meta asks for 1.0.0-next.*, and
  // @solidjs/start (legacy: null) has no Solid 2 line to be on.
  assert.deepEqual([...packagesOnSolid2Line({ dependencies: { "@solidjs/router": "2.0.0-next.42" } })], ["@solidjs/router"]);
  assert.deepEqual([...packagesOnSolid2Line({ dependencies: { "@solidjs/router": "^1.0.1" } })], []);
  assert.deepEqual([...packagesOnSolid2Line({ devDependencies: { "@solidjs/meta": "1.0.0-next.2" } })], ["@solidjs/meta"]);
  assert.deepEqual([...packagesOnSolid2Line({ dependencies: { "@solidjs/meta": "0.29.8" } })], []);
  assert.deepEqual([...packagesOnSolid2Line({ dependencies: { "@solidjs/start": "^2.0.0-next.1" } })], []);
  assert.deepEqual([...packagesOnSolid2Line({})], []);
  assert.deepEqual([...packagesOnSolid2Line(null)], []);

  const routerFinding = { rule: "imports/ecosystem-apis", file: "src/a.tsx", line: 1, column: 10, severity: "build", headline: "Migrate this A import from @solidjs/router, which Solid 2 removes or moves.", why: "", guidance: "", lint: [], guide: "x" };
  const metaFinding = { rule: "imports/ecosystem-apis", file: "src/b.tsx", line: 2, column: 1, severity: "behavior", headline: "Review this Meta import from @solidjs/meta, whose Solid 2 behavior changed.", why: "", guidance: "", lint: [], guide: "x" };
  const startFinding = { rule: "imports/ecosystem-apis", file: "src/c.tsx", line: 3, column: 1, severity: "build", headline: "Migrate this @solidjs/start/config import, which has no Solid 2 release.", why: "", guidance: "", lint: [], guide: "x" };
  const otherFinding = { rule: "reactivity/create-effect", file: "src/d.tsx", line: 4, column: 1, severity: "build", headline: "Migrate this two-argument createEffect call.", why: "", guidance: "", lint: [], guide: "x" };

  const allFindings = [routerFinding, metaFinding, startFinding, otherFinding];
  const migrated = { dependencies: { "@solidjs/router": "2.0.0-next.42", "@solidjs/meta": "1.0.0-next.2" } };
  assert.deepEqual(
    filterEcosystemFindings(allFindings, migrated).map((finding) => finding.rule + " " + finding.file),
    ["imports/ecosystem-apis src/c.tsx", "reactivity/create-effect src/d.tsx"],
  );
  // A subpath specifier is matched to its root package.
  const routerSubpath = { ...routerFinding, headline: "Migrate this fileRoutes import from @solidjs/router/fs, which Solid 2 removes or moves." };
  assert.deepEqual(
    filterEcosystemFindings([routerSubpath], migrated),
    [],
  );
  // A project that already declares solid-js 2.x uses createSignal(fn) and
  // createStore(fn) as the documented derived primitives, so that rule's
  // review findings are dropped there and kept on Solid 1 projects.
  const derivedFinding = { rule: "reactivity/create-signal-function", file: "src/e.tsx", line: 5, column: 1, severity: "behavior", headline: "Review this createSignal(fn) call: a function first argument now creates a writable derived signal.", why: "", guidance: "", lint: [], guide: "x" };
  assert.deepEqual(
    filterEcosystemFindings([derivedFinding, otherFinding], { dependencies: { "solid-js": "2.0.0-rc.18" } }).map((finding) => finding.rule),
    ["reactivity/create-effect"],
  );
  assert.deepEqual(filterEcosystemFindings([derivedFinding], { dependencies: { "solid-js": "^1.9.7" } }), [derivedFinding]);
  // Only a range whose lower bound is major 2 counts as the Solid 2 line.
  for (const range of ["2.0.0-rc.21", "^2.0.0-rc.18", "~2.0.0", ">=2.0.0-rc.1", "=2.0.0", " 2.1.0"]) assert.equal(isSolid2Range(range), true, range);
  for (const range of ["^1.9.7", "1.9.19", "<2.0.0", ">=1.0.0 <2.0.0", "next", "workspace:*", "", undefined]) assert.equal(isSolid2Range(range), false, String(range));
  // When nothing is declared on the Solid 2 line, nothing is filtered.
  assert.deepEqual(filterEcosystemFindings(allFindings, {}), allFindings);
  assert.deepEqual(filterEcosystemFindings(allFindings, null), allFindings);
  // The transform workflow is never filtered (its rewrites are not findings).
  assert.deepEqual(
    filterEcosystemFindings([{ rule: "other" }, routerFinding], migrated).map((finding) => finding.rule),
    ["other"],
  );

  // End-to-end: on an analyze run, filter applies to every output format.
  const reported = { findings: [routerFinding, metaFinding, otherFinding], rewrites: [] };
  const stepOutput = `  SMA-REPORT ${JSON.stringify(reported)}`;
  for (const format of ["json", "text", "agent"]) {
    const surface = mkdtempSync(join(tmpdir(), "sma-ecosystem-filter-"));
    try {
      writeFileSync(join(surface, "package.json"), JSON.stringify(migrated));
      const printed = [];
      const originalLog = console.log;
      console.log = (...values) => printed.push(values.join(" "));
      let result;
      try {
        result = captureMain(["--format", format, "--target", surface], {
          cwd: surface,
          projectImpl: () => [],
          runImpl: () => ({ status: 0, stderr: stepOutput }),
        });
      } finally {
        console.log = originalLog;
      }
      assert.equal(result.status, 0);
      const rendered = printed.join("\n");
      assert.ok(!rendered.includes("@solidjs/router"), `${format}: must drop the @solidjs/router finding`);
      assert.ok(!rendered.includes("@solidjs/meta"), `${format}: must drop the @solidjs/meta finding`);
      assert.ok(rendered.includes("createEffect"), `${format}: must keep the non-ecosystem finding`);
      if (format === "json") {
        const document = JSON.parse(printed[0]);
        assert.equal(document.summary.findings, 1);
      }
    } finally {
      rmSync(surface, { recursive: true, force: true });
    }
  }
});

test("announces on stderr that the project already declares Solid 2", () => {
  assert.equal(declaredSolidVersion({ dependencies: { "solid-js": "2.0.0-rc.18" } }), "2.0.0-rc.18");
  assert.equal(declaredSolidVersion({ devDependencies: { "solid-js": "^1.9.3" } }), "^1.9.3");
  assert.equal(declaredSolidVersion({ peerDependencies: { "solid-js": "^2.0.0" } }), "^2.0.0");
  assert.equal(declaredSolidVersion({}), null);
  assert.equal(declaredSolidVersion(null), null);
  assert.equal(isSolid2Range("2.0.0-rc.18"), true);
  assert.equal(isSolid2Range("^2.0.0"), true);
  assert.equal(isSolid2Range("~2.0.0-next.42"), true);
  assert.equal(isSolid2Range("^1.9.3"), false);
  assert.equal(isSolid2Range("1.0.1"), false);
  assert.equal(isSolid2Range(undefined), false);
  assert.equal(solid2Notice({ dependencies: { "solid-js": "^1.9.3" } }), null);
  const notice = solid2Notice({ dependencies: { "solid-js": "2.0.0-rc.18" } });
  assert.match(notice, /^\[solid-migration-assistant\]/);
  assert.match(notice, /already declares Solid 2/);
  assert.match(notice, /understands Solid 1 source/);
  assert.match(notice, /"2\.0\.0-rc\.18"/);

  const stepOutput = `  SMA-REPORT ${JSON.stringify({ findings: [], rewrites: [] })}`;
  const solid2 = mkdtempSync(join(tmpdir(), "sma-solid2-notice-"));
  const solid1 = mkdtempSync(join(tmpdir(), "sma-solid1-no-notice-"));
  try {
    writeFileSync(join(solid2, "package.json"), JSON.stringify({ dependencies: { "solid-js": "2.0.0-rc.18", "@solidjs/web": "2.0.0-rc.18" } }));
    writeFileSync(join(solid1, "package.json"), JSON.stringify({ dependencies: { "solid-js": "^1.9.3" } }));

    const originalLog = console.log;
    console.log = () => {};
    let two;
    let one;
    try {
      two = captureMain(["--target", solid2], {
        cwd: solid2,
        projectImpl: () => [],
        runImpl: () => ({ status: 0, stderr: stepOutput }),
      });
      one = captureMain(["--target", solid1], {
        cwd: solid1,
        projectImpl: () => [],
        runImpl: () => ({ status: 0, stderr: stepOutput }),
      });
    } finally {
      console.log = originalLog;
    }
    assert.equal(two.status, 0);
    assert.ok(two.diagnostics.some((line) => /already declares Solid 2/.test(line)), "Solid 2 project must print the notice on stderr");
    // Notice is emitted before the final disclosure.
    const noticeIndex = two.diagnostics.findIndex((line) => /already declares Solid 2/.test(line));
    const disclosureIndex = two.diagnostics.indexOf(DISCLOSURE);
    assert.ok(noticeIndex < disclosureIndex, "notice must precede DISCLOSURE");
    assert.equal(one.status, 0);
    assert.ok(!one.diagnostics.some((line) => /already declares Solid 2/.test(line)), "Solid 1 project must not print the notice");

    // Transform never prints the notice: it is scoped to analyze output.
    let transform;
    const originalLog2 = console.log;
    console.log = () => {};
    try {
      transform = captureMain(["transform", "--allow-dirty", "--target", solid2], {
        cwd: solid2,
        projectImpl: () => assert.fail("transform must not read manifest findings"),
        runImpl: () => ({ status: 0, stderr: stepOutput }),
      });
    } finally {
      console.log = originalLog2;
    }
    assert.equal(transform.status, 0);
    assert.ok(!transform.diagnostics.some((line) => /already declares Solid 2/.test(line)), "transform must not print the analyzer-scoped notice");
  } finally {
    rmSync(solid2, { recursive: true, force: true });
    rmSync(solid1, { recursive: true, force: true });
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
