import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DISCLOSURE, projectFindings } from "../shared/run-workflow.mjs";
import { SEVERITY_TIERS } from "../shared/format.mjs";
import { dependencyHeadline } from "../shared/dependencies.mjs";
import { discoverRules, staleFiles } from "../tools/generate.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const analysisDirectory = resolve(packageDirectory, "rules/analysis");
const transformationsDirectory = resolve(packageDirectory, "rules/transformations");
const testsDirectory = resolve(packageDirectory, "tests");

test("derives every rule registry from the rule folders", () => {
  // tools/generate.mjs writes the entrypoints, both workflows, the packaged
  // file list, and the fixture runner's rule table from the rule folders;
  // a stale or hand-edited copy fails here.
  assert.deepEqual(staleFiles(), [], "run `pnpm generate` and commit the result");

  const analysisRules = discoverRules("analysis");
  const transformRules = discoverRules("transformations");
  const analysisSteps = analysisRules.flatMap((rule) => rule.steps);
  const transformSteps = transformRules.flatMap((rule) => rule.steps);
  assert.ok(analysisSteps.length > 0 && transformSteps.length > 0);
  assert.equal(new Set([...analysisSteps, ...transformSteps]).size, analysisSteps.length + transformSteps.length);

  // Exactly one entrypoint file per step and one report emitter: no strays
  // or leftover central scripts anywhere under scripts/, and only one
  // analyze workflow file.
  assert.deepEqual(productionScripts(), ["emit-report.ts"]);
  assert.deepEqual(workflowFiles(), ["workflow.yaml"]);
  assert.deepEqual(
    readdirSync(resolve(packageDirectory, "scripts/analysis")).sort(),
    analysisSteps.map((name) => name + ".ts").sort(),
  );
  assert.deepEqual(
    readdirSync(resolve(packageDirectory, "scripts/transformations")).sort(),
    transformSteps.map((name) => name + ".ts").sort(),
  );

  const analyzeWorkflow = readFileSync(resolve(packageDirectory, "workflow.yaml"), "utf8");
  const transformWorkflow = readFileSync(resolve(packageDirectory, "transform.yaml"), "utf8");
  assert.equal((analyzeWorkflow.match(/semantic_analysis: workspace/g) ?? []).length, analysisSteps.length);
  assert.doesNotMatch(analyzeWorkflow, /semantic_analysis: file/);
  // Transform steps get workspace semantics too, but only for positive,
  // cross-file proofs (shared/provenance.ts): a reference set is never used
  // to prove that something has no other uses.
  assert.equal((transformWorkflow.match(/semantic_analysis: workspace/g) ?? []).length, transformSteps.length);
  assert.doesNotMatch(transformWorkflow, /semantic_analysis: file/);
  assert.equal((analyzeWorkflow.match(/max_threads: 1/g) ?? []).length, 1);
  assert.equal((transformWorkflow.match(/max_threads: 1/g) ?? []).length, 1);
  for (const workflow of [analyzeWorkflow, transformWorkflow]) {
    assert.match(workflow, /js_file: scripts\/emit-report\.ts\n {10}base_path: "\."\n {10}language: "tsx"\n {10}max_threads: 1\n(?:.*\n)*$/);
  }

  // The opt-in benchmark ships but stays out of the verified test surface.
  const packageJson = JSON.parse(readFileSync(resolve(packageDirectory, "package.json"), "utf8"));
  for (const shipped of ["shared/entrypoint.ts", "benchmarks/workspace-pass.ts", "benchmarks/workspace-passes.mjs"]) {
    assert.equal(packageJson.files.includes(shipped), true, shipped);
  }
  for (const script of ["test", "verify", "check-types", "validate"]) {
    assert.doesNotMatch(packageJson.scripts[script], /benchmark/, script);
  }
  const benchmarkProbe = readFileSync(resolve(packageDirectory, "benchmarks/workspace-pass.ts"), "utf8");
  const benchmarkDriver = readFileSync(resolve(packageDirectory, "benchmarks/workspace-passes.mjs"), "utf8");
  assert.match(benchmarkProbe, /binding\.references\(\)/);
  assert.match(benchmarkProbe, /createWorkspacePass\(marker:/);
  assert.match(benchmarkDriver, /createBenchmarkWorkflow/);
  assert.match(benchmarkDriver, /createWorkspacePass\(\$\{JSON\.stringify/);
  assert.match(benchmarkDriver, /HOME: stateDirectory/);
  assert.match(benchmarkDriver, /XDG_CACHE_HOME/);
  assert.match(benchmarkDriver, /XDG_DATA_HOME/);

  for (const obsolete of ["scripts/analyze.ts", "scripts/transform.ts", "shared/fixture-harness.ts"]) {
    assert.equal(existsSync(resolve(packageDirectory, obsolete)), false, obsolete);
  }
  const sharedEntrypoint = readFileSync(resolve(packageDirectory, "shared/entrypoint.ts"), "utf8");
  assert.match(sharedEntrypoint, /createAnalysisEntrypoint\(ruleId: string, rule:/);
  assert.match(sharedEntrypoint, /createTransformEntrypoint\(ruleId: string, rule:/);
  assert.doesNotMatch(sharedEntrypoint, /rules:|flatMap|composeTransformChanges/);
});

test("retains one deterministic report emitter after all rule steps", () => {
  const emitter = readFileSync(resolve(packageDirectory, "scripts/emit-report.ts"), "utf8");
  assert.equal((emitter.match(/console\.log\(/g) ?? []).length, 1);
  assert.doesNotMatch(emitter, /localeCompare/);
});

test("exposes analyze and transform workflows", () => {
  const packageJson = JSON.parse(readFileSync(resolve(packageDirectory, "package.json"), "utf8"));
  const codemod = readFileSync(resolve(packageDirectory, "codemod.yaml"), "utf8");

  assert.equal(typeof packageJson.scripts.analyze, "string");
  assert.equal(typeof packageJson.scripts.transform, "string");
  assert.match(codemod, /- name: analyze/);
  assert.match(codemod, /- name: transform/);
  assert.doesNotMatch(codemod, /name: write|report\.yaml/i);
});

test("colocates each rule with its fixtures and nothing else", () => {
  for (const kind of ["analysis", "transformations"]) {
    for (const rule of discoverRules(kind)) {
      const folder = resolve(packageDirectory, dirname(rule.source));
      const entries = readdirSync(folder, { withFileTypes: true });
      assert.deepEqual(
        entries.map((entry) => (entry.isDirectory() ? entry.name + "/" : entry.name)).sort(),
        [basename(rule.source), "fixtures/"].sort(),
        rule.id,
      );
    }
  }
});

test("keeps each transform rule inside its declared scope", () => {
  // solid-js/web belongs to the binding-gated rule only; it must never be
  // added to the pure-relocation map, which rewrites without proving names.
  const legacyRule = readFileSync(
    resolve(
      transformationsDirectory,
      "imports/legacy-subpath-relocation/legacy-subpath-relocation.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(legacyRule, /"solid-js\/web"/);
  assert.equal(
    (legacyRule.match(/"solid-js\/[a-z-]+": "@solidjs\//g) ?? []).length,
    5,
  );

  const webRule = readFileSync(
    resolve(
      transformationsDirectory,
      "imports/web-package-relocation/web-package-relocation.ts",
    ),
    "utf8",
  );
  const allowlist = /PROVEN_WEB_BINDINGS[^=]*= new Set\(\[([^\]]*)\]\)/.exec(
    webRule,
  );
  assert.ok(allowlist, "web rule must declare PROVEN_WEB_BINDINGS as a Set");
  assert.deepEqual(
    [...allowlist[1].matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]),
    ["Dynamic", "hydrate", "isServer", "render"],
  );
  // Dynamic was vetoed while it existed only in upstream prose and compiler
  // configuration; it is admitted now that `packages/web/src/index.ts` at the
  // pinned rc.21 commit exports it, and the rule must still record that
  // evidence (and the deprecation) rather than widen the list silently.
  assert.match(webRule, /`Dynamic` is on this list because/);
  assert.match(webRule, /deprecated/);
  for (const vetoed of ["Portal", "isDev", "createDynamic", "Index", "SuspenseList"]) {
    assert.doesNotMatch(allowlist[1], new RegExp(`"${vetoed}"`), vetoed);
  }

  // The JSX rewrites stay on JSX syntax: the Index, Suspense, and
  // ErrorBoundary rules may touch an import statement (to rename or remove
  // the legacy specifier), and none of them may rewrite a module source
  // string. Suspense/ErrorBoundary rename the specifier in place via shared
  // helpers, so the rule source does not need to spell `import_statement`.
  for (const [rule, touchesImports] of [
    ["jsx/context-provider-to-context/context-provider-to-context.ts", true],
    ["jsx/error-boundary-to-errored/error-boundary-to-errored.ts", false],
    ["jsx/index-to-for/index-to-for.ts", true],
    ["jsx/lowercase-event-handlers/lowercase-event-handlers.ts", false],
    ["jsx/suspense-to-loading/suspense-to-loading.ts", false],
  ]) {
    const source = readFileSync(resolve(transformationsDirectory, rule), "utf8");
    assert.match(source, /jsx_opening_element/, rule);
    assert.match(source, /jsx_self_closing_element/, rule);
    assert.doesNotMatch(source, /export_statement|findModuleReferences/, rule);
    if (!touchesImports) assert.doesNotMatch(source, /import_statement/, rule);
  }
  for (const analyzer of [
    "jsx/context-provider/context-provider.ts",
    "jsx/component-renames/component-renames.ts",
    "jsx/dom-lowercase-events/dom-lowercase-events.ts",
  ]) {
    assert.equal(existsSync(resolve(analysisDirectory, analyzer)), true, analyzer);
  }

  // The classList rewrite is JSX-only and must stay off the import rules'
  // territory, and the read-only classList analyzer stays in place to report
  // everything the rewrite refuses.
  const classListRule = readFileSync(
    resolve(
      transformationsDirectory,
      "jsx/class-list-to-class/class-list-to-class.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(classListRule, /import_statement|export_statement/);
  assert.match(classListRule, /jsx_opening_element/);
  assert.match(classListRule, /jsx_self_closing_element/);
  assert.equal(
    existsSync(resolve(analysisDirectory, "jsx/class-list/class-list.ts")),
    true,
  );
});

test("uses normal analyzer end-to-end fixtures", () => {
  assert.deepEqual(readdirSync(testsDirectory).sort(), [
    "architecture.test.mjs",
    "cli.test.mjs",
    "corpus",
    "corpus.test.mjs",
    "empty",
    "fixture",
    "fixture-expected",
    "fixture-runner.ts",
    "helpers.mjs",
    "packaging.test.mjs",
    "rc-compat",
    "rc-compat.test.mjs",
    "rule-fixtures.test.mjs",
    "rules.generated.ts",
    "transform-expected",
    "transform-fixture",
    "transform.test.mjs",
    "workflow.test.mjs",
  ]);
  assert.equal(existsSync(resolve(testsDirectory, "transform.test.ts")), false);

  const fixturePackage = JSON.parse(
    readFileSync(resolve(testsDirectory, "fixture/package.json"), "utf8"),
  );
  const emptyPackage = JSON.parse(
    readFileSync(resolve(testsDirectory, "empty/package.json"), "utf8"),
  );
  assert.match(fixturePackage.description, /Analyzer-only.*terminal guidance/);
  assert.match(emptyPackage.description, /Analyzer-only.*no supported/);
  assert.equal(fixturePackage.scripts, undefined);
  assert.equal(fixturePackage.dependencies["solid-js"], "1.9.14");
  assert.equal(fixturePackage.devDependencies.typescript, "6.0.3");
  assert.equal(fixturePackage.devDependencies.vite, undefined);
  assert.equal(emptyPackage.scripts, undefined);
  assert.equal(emptyPackage.dependencies, undefined);
  assert.doesNotMatch(readFixtureText(), /codemod-reports|transform|report/i);
});

test("cites one pinned upstream Solid commit everywhere", () => {
  const pinned = /source commit ([0-9a-f]{40})/.exec(DISCLOSURE)?.[1];
  assert.ok(pinned, "the disclosure must name the pinned source commit");
  const citations = new Map();
  for (const file of sourceFiles()) {
    for (const [, hash] of readFileSync(file, "utf8").matchAll(
      /github\.com\/solidjs\/solid\/(?:blob|tree)\/([0-9a-f]{40})/g,
    )) {
      if (hash !== pinned) citations.set(relative(packageDirectory, file), hash);
    }
  }
  assert.deepEqual([...citations], [], "every upstream citation must use the pinned commit");

  // shared/target.ts is the source for every rule; the launcher repeats the
  // two values because it cannot import TypeScript, so they must agree, and
  // every rule must read the target from the shared module rather than
  // embedding its own copy.
  const target = readFileSync(resolve(packageDirectory, "shared/target.ts"), "utf8");
  const version = /SOLID_TARGET_VERSION = "([^"]+)"/.exec(target)?.[1];
  assert.equal(/SOLID_SOURCE_COMMIT =\n\s+"([0-9a-f]{40})"/.exec(target)?.[1], pinned);
  assert.ok(version, "shared/target.ts must declare SOLID_TARGET_VERSION");
  assert.match(DISCLOSURE, new RegExp(`solid-js@${version.replace(/\./g, "\\.")} `));
  for (const rule of [
    ...ruleFiles(analysisDirectory, (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((path) => resolve(analysisDirectory, path)),
    ...ruleFiles(transformationsDirectory, (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((path) => resolve(transformationsDirectory, path)),
  ]) {
    const source = readFileSync(rule, "utf8");
    assert.match(source, /from "(?:\.\.\/)+shared\/target\.ts"/, relative(packageDirectory, rule));
    assert.doesNotMatch(source, /blob\/[0-9a-f]{40}\/documentation/, relative(packageDirectory, rule));
  }
  assert.equal(existsSync(resolve(packageDirectory, "tools/bump-target.mjs")), true);
});

/** Every shipped or reviewed text file: rules, scripts, shared, workflows, READMEs, and tests. */
function sourceFiles() {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:ts|tsx|mjs|yaml|md)$/.test(entry.name)) files.push(path);
    }
  };
  walk(packageDirectory);
  files.push(resolve(packageDirectory, "../../README.md"));
  return files;
}

test("keeps every finding well-formed data", () => {
  // Findings are data rendered only at the edges (shared/format.mjs), so
  // their fields carry no formatting: every committed analysis snapshot and
  // every launcher project finding must have a known rule and tier, a
  // capitalized one-sentence headline, and non-empty details.
  const findings = [];
  const covered = new Set();
  for (const rule of discoverRules("analysis")) {
    const fixtures = resolve(packageDirectory, dirname(rule.source), "fixtures");
    for (const name of readdirSync(fixtures).filter((entry) => entry.endsWith(".expected.json"))) {
      const snapshot = JSON.parse(readFileSync(resolve(fixtures, name), "utf8"));
      for (const finding of snapshot.findings) {
        assert.equal(finding.rule, rule.id, name);
        covered.add(finding.rule);
        findings.push(finding);
      }
    }
  }
  assert.deepEqual(
    discoverRules("analysis").map((rule) => rule.id).filter((id) => !covered.has(id)),
    [],
    "every analysis rule needs a fixture with at least one finding",
  );
  const project = projectFindings(resolve(testsDirectory, "fixture"));
  assert.ok(project.length > 0);
  findings.push(...project);
  for (const status of ["upgrade", "replace", "use-core", "blocked"]) {
    findings.push({ ...project[0], headline: dependencyHeadline({ name: "@scope/package", status }) });
  }

  const tiers = new Set(SEVERITY_TIERS.map((tier) => tier.id));
  for (const finding of findings) {
    const at = `${finding.file}:${finding.line}:${finding.column} ${finding.headline}`;
    assert.match(finding.rule, /^(?:[a-z]+\/[a-z0-9-]+)$/, at);
    assert.ok(tiers.has(finding.severity), at);
    assert.ok(Number.isInteger(finding.line) && finding.line >= 1, at);
    assert.ok(Number.isInteger(finding.column) && finding.column >= 1, at);
    assert.match(finding.headline, /^[A-Z][^\n]*\.$/, at);
    assert.doesNotMatch(finding.headline, /Manual review required|Official migration guide/, at);
    for (const field of ["why", "guidance"]) {
      assert.match(finding[field], /^\S[^\n]*\S$/, `${at} ${field}`);
      assert.doesNotMatch(finding[field], /Make and validate|Official migration guide|Ongoing check/, `${at} ${field}`);
    }
    assert.ok(Array.isArray(finding.lint) && finding.lint.every((rule) => /^[a-z-]+$/.test(rule)), at);
    assert.match(finding.guide, /^https:\/\/\S+$/, at);
  }
});

function ruleFiles(directory, predicate) {
  return ruleEntries(directory, (entry) => entry.isFile() && predicate(entry.name));
}

function ruleEntries(directory, predicate = () => true) {
  const entries = [];
  visitRules(directory, directory, entries, predicate);
  return entries.sort();
}

function visitRules(directory, baseDirectory, entries, predicate) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (predicate(entry)) {
      entries.push(relative(baseDirectory, path).replaceAll("\\", "/"));
    }
    if (entry.isDirectory()) visitRules(path, baseDirectory, entries, predicate);
  }
}

function readFixtureText() {
  const contents = [];
  for (const fixture of ["fixture", "empty"]) {
    visit(resolve(testsDirectory, fixture), contents);
  }
  return contents.join("\n");
}

function visit(directory, contents) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) visit(path, contents);
    if (entry.isFile()) contents.push(readFileSync(path, "utf8"));
  }
}

function productionScripts() {
  return readdirSync(resolve(packageDirectory, "scripts"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && !entry.name.includes(".test."))
    .map((entry) => entry.name)
    .sort();
}

function workflowFiles() {
  return readdirSync(packageDirectory)
    .filter((name) => name.startsWith("workflow") && name.endsWith(".yaml"))
    .sort();
}
