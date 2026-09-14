import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const analysisDirectory = resolve(packageDirectory, "rules/analysis");
const transformationsDirectory = resolve(packageDirectory, "rules/transformations");
const testsDirectory = resolve(packageDirectory, "tests");

const EXPECTED_ANALYSIS_PRODUCTION = [
"imports/beta32-subpaths/beta32-subpaths.ts",
  "imports/web-import/web-import.ts",
  "jsx/class-list/class-list.ts",
  "jsx/component-renames/component-renames.ts",
  "jsx/context-provider/context-provider.ts",
  "jsx/dom-attr-namespaces/dom-attr-namespaces.ts",
  "jsx/dom-event-namespaces/dom-event-namespaces.ts",
  "jsx/dom-use-directive/dom-use-directive.ts",
  "lifecycle/on-cleanup/on-cleanup.ts",
  "lifecycle/on-mount/on-mount.ts",
  "props/merge-props/merge-props.ts",
  "props/split-props/split-props.ts",
  "reactivity/batch/batch.ts",
  "reactivity/create-computed/create-computed.ts",
  "reactivity/create-dynamic/create-dynamic.ts",
  "reactivity/create-effect/create-effect.ts",
  "reactivity/create-memo/create-memo.ts",
  "reactivity/create-resource/create-resource.ts",
  "reactivity/create-selector/create-selector.ts",
  "reactivity/error-handling/error-handling.ts",
  "reactivity/from-observable/from-observable.ts",
  "reactivity/index-array/index-array.ts",
  "reactivity/on-helper/on-helper.ts",
  "reactivity/transition-apis/transition-apis.ts",
  "reactivity/utility-renames/utility-renames.ts",
  "store/mutable/mutable.ts",
  "store/produce/produce.ts",
  "store/unwrap/unwrap.ts",
];
const EXPECTED_ANALYSIS_TESTS = [
"imports/beta32-subpaths/beta32-subpaths.test.ts",
  "imports/web-import/web-import.test.ts",
  "jsx/class-list/class-list.test.ts",
  "jsx/component-renames/component-renames.test.ts",
  "jsx/context-provider/context-provider.test.ts",
  "jsx/dom-attr-namespaces/dom-attr-namespaces.test.ts",
  "jsx/dom-event-namespaces/dom-event-namespaces.test.ts",
  "jsx/dom-use-directive/dom-use-directive.test.ts",
  "lifecycle/on-cleanup/on-cleanup.test.ts",
  "lifecycle/on-mount/on-mount.test.ts",
  "props/merge-props/merge-props.test.ts",
  "props/split-props/split-props.test.ts",
  "reactivity/batch/batch.test.ts",
  "reactivity/create-computed/create-computed.test.ts",
  "reactivity/create-dynamic/create-dynamic.test.ts",
  "reactivity/create-effect/create-effect.test.ts",
  "reactivity/create-memo/create-memo.test.ts",
  "reactivity/create-resource/create-resource.test.ts",
  "reactivity/create-selector/create-selector.test.ts",
  "reactivity/error-handling/error-handling.test.ts",
  "reactivity/from-observable/from-observable.test.ts",
  "reactivity/index-array/index-array.test.ts",
  "reactivity/on-helper/on-helper.test.ts",
  "reactivity/transition-apis/transition-apis.test.ts",
  "reactivity/utility-renames/utility-renames.test.ts",
  "store/mutable/mutable.test.ts",
  "store/produce/produce.test.ts",
  "store/unwrap/unwrap.test.ts",
];
const EXPECTED_ANALYSIS_FIXTURES = [
"imports/beta32-subpaths/static-imports.fixture.tsx",
  "imports/web-import/static-imports.fixture.tsx",
  "jsx/class-list/normal.fixture.tsx",
  "jsx/component-renames/normal.fixture.tsx",
  "jsx/context-provider/normal.fixture.tsx",
  "jsx/dom-attr-namespaces/normal.fixture.tsx",
  "jsx/dom-event-namespaces/normal.fixture.tsx",
  "jsx/dom-use-directive/normal.fixture.tsx",
  "lifecycle/on-cleanup/direct-call.fixture.tsx",
  "lifecycle/on-cleanup/non-solid.fixture.tsx",
  "lifecycle/on-mount/direct-call.fixture.tsx",
  "lifecycle/on-mount/non-solid.fixture.tsx",
  "props/merge-props/direct-call.fixture.tsx",
  "props/merge-props/non-solid.fixture.tsx",
  "props/split-props/direct-call.fixture.tsx",
  "props/split-props/non-solid.fixture.tsx",
  "reactivity/batch/direct-call.fixture.tsx",
  "reactivity/batch/non-solid.fixture.tsx",
  "reactivity/create-computed/direct-call.fixture.tsx",
  "reactivity/create-computed/non-solid.fixture.tsx",
  "reactivity/create-dynamic/direct-call.fixture.tsx",
  "reactivity/create-dynamic/non-solid.fixture.tsx",
  "reactivity/create-effect/direct-call.fixture.tsx",
  "reactivity/create-effect/non-solid.fixture.tsx",
  "reactivity/create-memo/direct-call.fixture.tsx",
  "reactivity/create-memo/non-solid.fixture.tsx",
  "reactivity/create-resource/direct-call.fixture.tsx",
  "reactivity/create-resource/non-solid.fixture.tsx",
  "reactivity/create-selector/direct-call.fixture.tsx",
  "reactivity/create-selector/non-solid.fixture.tsx",
  "reactivity/error-handling/direct-call.fixture.tsx",
  "reactivity/error-handling/non-solid.fixture.tsx",
  "reactivity/from-observable/direct-call.fixture.tsx",
  "reactivity/from-observable/non-solid.fixture.tsx",
  "reactivity/index-array/direct-call.fixture.tsx",
  "reactivity/index-array/non-solid.fixture.tsx",
  "reactivity/on-helper/direct-call.fixture.tsx",
  "reactivity/on-helper/non-solid.fixture.tsx",
  "reactivity/transition-apis/direct-call.fixture.tsx",
  "reactivity/transition-apis/non-solid.fixture.tsx",
  "reactivity/utility-renames/direct-call.fixture.tsx",
  "reactivity/utility-renames/non-solid.fixture.tsx",
  "store/mutable/direct-call.fixture.tsx",
  "store/mutable/non-solid.fixture.tsx",
  "store/produce/direct-call.fixture.tsx",
  "store/produce/non-solid.fixture.tsx",
  "store/unwrap/direct-call.fixture.tsx",
  "store/unwrap/non-solid.fixture.tsx",
];

const EXPECTED_ANALYSIS_FOLDERS = EXPECTED_ANALYSIS_PRODUCTION.map((path) =>
  dirname(path),
).sort();

const EXPECTED_TRANSFORM_PRODUCTION = [
  "imports/legacy-subpath-relocation/legacy-subpath-relocation.ts",
  "imports/web-package-relocation/web-package-relocation.ts",
  "jsx/class-list-to-class/class-list-to-class.ts",
];
const EXPECTED_TRANSFORM_TESTS = [
  "imports/legacy-subpath-relocation/legacy-subpath-relocation.test.ts",
  "imports/web-package-relocation/web-package-relocation.test.ts",
  "jsx/class-list-to-class/class-list-to-class.test.ts",
];
const EXPECTED_TRANSFORM_FIXTURES = [
  "imports/legacy-subpath-relocation/fixtures/destructured-require.fixture.tsx",
  "imports/legacy-subpath-relocation/fixtures/escaped-specifiers.fixture.tsx",
  "imports/legacy-subpath-relocation/fixtures/negative-forms.fixture.tsx",
  "imports/legacy-subpath-relocation/fixtures/no-matches.fixture.tsx",
  "imports/legacy-subpath-relocation/fixtures/prototype-names.fixture.tsx",
  "imports/legacy-subpath-relocation/fixtures/re-exports.fixture.tsx",
  "imports/legacy-subpath-relocation/fixtures/relocations.fixture.tsx",
  "imports/legacy-subpath-relocation/fixtures/runtime-forms.fixture.tsx",
  "imports/legacy-subpath-relocation/fixtures/shadowed-require.fixture.tsx",
  "imports/legacy-subpath-relocation/fixtures/single-quotes.fixture.tsx",
  "imports/legacy-subpath-relocation/fixtures/static-imports.fixture.tsx",
  "imports/web-package-relocation/fixtures/coexistence.fixture.tsx",
  "imports/web-package-relocation/fixtures/escaped-specifiers.fixture.tsx",
  "imports/web-package-relocation/fixtures/local-exports.fixture.tsx",
  "imports/web-package-relocation/fixtures/mixed-bindings.fixture.tsx",
  "imports/web-package-relocation/fixtures/named-imports.fixture.tsx",
  "imports/web-package-relocation/fixtures/named-re-exports.fixture.tsx",
  "imports/web-package-relocation/fixtures/near-miss-modules.fixture.tsx",
  "imports/web-package-relocation/fixtures/no-matches.fixture.tsx",
  "imports/web-package-relocation/fixtures/non-named-forms.fixture.tsx",
  "imports/web-package-relocation/fixtures/runtime-forms.fixture.tsx",
  "imports/web-package-relocation/fixtures/unsupported-shapes.fixture.tsx",
  "imports/web-package-relocation/fixtures/vetoed-bindings.fixture.tsx",
  "jsx/class-list-to-class/fixtures/attribute-values.fixture.tsx",
  "jsx/class-list-to-class/fixtures/class-conflicts.fixture.tsx",
  "jsx/class-list-to-class/fixtures/no-matches.fixture.tsx",
  "jsx/class-list-to-class/fixtures/non-intrinsic-elements.fixture.tsx",
  "jsx/class-list-to-class/fixtures/rewrites.fixture.tsx",
  "jsx/class-list-to-class/fixtures/spread-attributes.fixture.tsx",
];
const EXPECTED_TRANSFORM_FOLDERS = EXPECTED_TRANSFORM_PRODUCTION.map((path) =>
  dirname(path),
).sort();

/** The workflow-process modules and everything a transform artifact can bundle. */
const PRODUCTION_SOURCES = [
  "bin/solid-migration-assistant.mjs",
  "benchmarks/workspace-pass.ts",
  "benchmarks/workspace-passes.mjs",
  "shared/analysis.ts",
  "shared/entrypoint.ts",
  "shared/register-ts.mjs",
  "shared/run-workflow.mjs",
  "shared/transform.ts",
  "shared/workflow.ts",
  "workflows/analyze.ts",
  "workflows/transform.ts",
  ...EXPECTED_ANALYSIS_PRODUCTION.map((path) => `rules/analysis/${path}`),
  ...EXPECTED_TRANSFORM_PRODUCTION.map((path) => `rules/transformations/${path}`),
];

test("composes every named rule as its own inline jssg definition, analyzers as one parallel group and rewrites in sequence", () => {
  const analyzeWorkflow = read("workflows/analyze.ts");
  const transformWorkflow = read("workflows/transform.ts");
  const analysisRules = namedRuleExports(analysisDirectory, "analyze");
  const transformRules = namedRuleExports(
    transformationsDirectory,
    "relocate|rewrite",
  );
  assert.equal(analysisRules.length, 37);
  assert.equal(transformRules.length, 3);

  // One inline definition per named rule: the command name is the rule name,
  // the transform delegates to the bundled adapter with exactly that rule,
  // and every analyzer indexes the whole selected set for cross-file lookups.
  const analysisDefinitions = definitions(analyzeWorkflow, {
    adapter: "analyzeFile",
    semantic: true,
  });
  assert.equal(analysisDefinitions.length, 37);
  assert.equal((analyzeWorkflow.match(/jssg\(\{/g) ?? []).length, 37);
  assert.deepEqual(
    analysisDefinitions.map(({ name }) => name).sort(),
    analysisRules.map(({ name }) => name).sort(),
  );
  const transformDefinitions = definitions(transformWorkflow, {
    adapter: "transformFile",
    semantic: false,
  });
  assert.equal(transformDefinitions.length, 3);
  assert.equal((transformWorkflow.match(/jssg\(\{/g) ?? []).length, 3);
  assert.deepEqual(
    transformDefinitions.map(({ name }) => name).sort(),
    transformRules.map(({ name }) => name).sort(),
  );
  for (const { name, rule } of [...analysisDefinitions, ...transformDefinitions]) {
    assert.equal(rule, name, `jssg '${name}' must delegate to the rule of the same name`);
  }

  // Every rule is imported from its own module; nothing is re-implemented.
  for (const { name, source } of analysisRules) {
    assertNamedImport(analyzeWorkflow, name, `../rules/analysis/${source}`);
  }
  for (const { name, source } of transformRules) {
    assertNamedImport(transformWorkflow, name, `../rules/transformations/${source}`);
  }
  assert.match(
    analyzeWorkflow,
    /^import \{ jssg, parallel, sequence, workflow \} from "@codemod\.com\/orchestration";$/m,
  );
  assert.match(
    transformWorkflow,
    /^import \{ jssg, workflow \} from "@codemod\.com\/orchestration";$/m,
  );
  // Only the read-only analyzers may overlap; the mutating rewrites may not.
  assert.doesNotMatch(transformWorkflow, /parallel\(/);
  for (const workflow of [analyzeWorkflow, transformWorkflow]) {
    assert.match(
      workflow,
      /^import \{\n  aggregateReport,\n  FileStrings,\n  SOURCE_EXCLUDE,\n  SOURCE_INCLUDE,\n\} from "\.\.\/shared\/workflow\.ts";$/m,
    );
    assert.doesNotMatch(workflow, /semanticAnalysis: "file"|selector:|plan\(|input:|target:/);
    assert.doesNotMatch(workflow, /codemod:workflow|acquireLock|getState|setState|console\.log/);
  }

  // The analyze graph declares every definition as one parallel group and the
  // transform body awaits its three one at a time, in the recorded order.
  // Both return the aggregated strings as data. Nothing else runs.
  assert.deepEqual(
    listedIdentifiers(analyzeWorkflow, "analyzers").sort(),
    analysisDefinitions.map(({ binding }) => binding).sort(),
  );
  assert.match(
    analyzeWorkflow,
    /export default sequence\(parallel\(analyzers\), workflow\(aggregateReport\)\);\n$/,
  );
  // One group over the whole list: no manual chunking and no author-declared
  // concurrency, so the engine scheduler alone decides what actually overlaps.
  assert.equal((analyzeWorkflow.match(/sequence\(/g) ?? []).length, 1);
  assert.equal((analyzeWorkflow.match(/parallel\(analyzers\)/g) ?? []).length, 1);
  assert.doesNotMatch(
    analyzeWorkflow,
    /maxConcurrent|AdmissionScheduler|scheduler:|CODEMOD_ORCHESTRATION_CAPACITY|\.slice\(/,
  );
  assert.deepEqual(
    listedIdentifiers(transformWorkflow, "rewrites"),
    transformDefinitions.map(({ binding }) => binding),
  );
  assert.match(
    transformWorkflow,
    /export default workflow\(async \(\) => \{\n  const commands: string\[\]\[\]\[\] = \[\];\n  for \(const rewrite of rewrites\) \{\n    commands\.push\(await rewrite\(\)\);\n  \}\n  return \{ report: aggregateReport\(commands\) \};\n\}\);\n$/,
  );

  // The per-file adapter is the only bridge between a rule and the runtime.
  // It is bundled into every artifact, so it must not touch the runtime.
  const entrypoint = read("shared/entrypoint.ts");
  assert.match(entrypoint, /export function analyzeFile\(/);
  assert.match(entrypoint, /export function transformFile\(/);
  assert.match(entrypoint, /content: null, output: guidance/);
  assert.match(entrypoint, /content: rootNode\.commitEdits\(/);
  assert.doesNotMatch(entrypoint, /@codemod\.com\/orchestration|rules:|flatMap|composeTransformChanges/);
  assert.doesNotMatch(
    read("shared/transform.ts"),
    /composeTransformChanges|overlapping transform edits|STATE_KEY/,
  );
  assert.doesNotMatch(
    read("shared/analysis.ts"),
    /compareGuidance|guidanceLocation|siteGuidance|STATE_KEY/,
  );

  // No production module depends on the legacy workflow shared state.
  for (const source of PRODUCTION_SOURCES) {
    assert.doesNotMatch(read(source), /codemod:workflow|acquireLock|getState|setState/, source);
  }

  // The YAML composition, its per-rule entrypoints, and the report emitter are gone.
  for (const obsolete of [
    "scripts",
    "workflow.yaml",
    "transform.yaml",
    "codemod.yaml",
    "shared/state.ts",
  ]) {
    assert.equal(existsSync(resolve(packageDirectory, obsolete)), false, obsolete);
  }
  assert.deepEqual(
    readdirSync(packageDirectory).filter((name) => name.endsWith(".yaml")),
    [],
  );
  assert.deepEqual(readdirSync(resolve(packageDirectory, "workflows")).sort(), [
    "analyze.ts",
    "sandbox-modules.d.ts",
    "transform.ts",
  ]);
});

test("aggregates and renders reports deterministically", () => {
  // The workflows dedupe and sort as whole strings, exactly as the former
  // emitter did; the launcher only joins what a workflow returned.
  const sharedWorkflow = read("shared/workflow.ts");
  assert.match(sharedWorkflow, /new Set<string>\(\)/);
  assert.match(sharedWorkflow, /return \[\.\.\.unique\]\.sort\(\);/);
  assert.doesNotMatch(sharedWorkflow, /localeCompare|compareGuidance/);
  assert.deepEqual(
    read("shared/workflow.ts").match(/^export const SOURCE_(?:INCLUDE|EXCLUDE)/gm),
    ["export const SOURCE_INCLUDE", "export const SOURCE_EXCLUDE"],
  );

  const launcher = read("shared/run-workflow.mjs");
  assert.equal((launcher.match(/stdout\.write\(/g) ?? []).length, 1);
  assert.doesNotMatch(launcher, /console\.log\(/);
  assert.match(launcher, /separator: "\\n\\n",\n    disclosure: true,/);
  assert.match(launcher, /separator: "\\n",\n    disclosure: false,/);
  assert.match(launcher, /await import\(\s*"@codemod\.com\/orchestration",?\s*\)/);
  assert.match(launcher, /new BridgeExecutor\(\{ bin: bridge, cwd: target, artifacts \}\)/);
  assert.match(launcher, /await loadWorkflow\(workflowPath\)/);
  assert.match(launcher, /await run\(exports\.default, \{/);
  assert.doesNotMatch(launcher, /MemoryHistoryStore|history:|fromJSON|serialize\(/);
  // Admission capacity is host configuration in the engine; this package
  // neither passes a scheduler nor exposes a concurrency knob of its own.
  assert.doesNotMatch(
    launcher,
    /scheduler:|AdmissionScheduler|SchedulingExecutor|concurrency|capacity/i,
  );
  assert.doesNotMatch(launcher, /workflow run|--allow-dirty|codemod\/package\.json/);
  assert.equal(
    read("bin/solid-migration-assistant.mjs"),
    '#!/usr/bin/env node\n\nimport { launch } from "../shared/run-workflow.mjs";\n\nprocess.exitCode = await launch(process.argv.slice(2));\n',
  );
});

test("exposes the analyze and transform workflows through the launcher and ships what they load", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.scripts.analyze, "node ./bin/solid-migration-assistant.mjs");
  assert.equal(
    packageJson.scripts.transform,
    "node ./bin/solid-migration-assistant.mjs transform",
  );
  assert.deepEqual(
    Object.keys(packageJson.scripts)
      .filter((name) => /^test:transform/.test(name))
      .sort(),
    ["test:transform", "test:transform-rules"],
  );
  assert.equal(packageJson.scripts.validate, undefined);
  assert.equal(
    packageJson.scripts["check-types"],
    "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.workflows.json",
  );
  for (const script of ["test", "verify", "check-types"]) {
    assert.doesNotMatch(packageJson.scripts[script], /benchmark/, script);
  }
  for (const shipped of PRODUCTION_SOURCES) {
    assert.equal(packageJson.files.includes(shipped), true, shipped);
  }
  assert.equal(packageJson.files.includes("workflows/sandbox-modules.d.ts"), false);

  // The sandbox-side and workflow-side type programs stay separate: the
  // rules are typed against the sandbox's node:* shims, the workflows
  // against @types/node, and only the workflow program sees the runtime.
  const sandboxProgram = JSON.parse(read("tsconfig.json"));
  const workflowProgram = JSON.parse(read("tsconfig.workflows.json"));
  assert.deepEqual(sandboxProgram.compilerOptions.types, ["@codemod.com/jssg-types"]);
  assert.equal(sandboxProgram.compilerOptions.erasableSyntaxOnly, true);
  assert.deepEqual(sandboxProgram.exclude, [
    "tests",
    "workflows",
    "shared/workflow.ts",
    "**/*.test.ts",
    "**/*.fixture.tsx",
  ]);
  assert.equal(workflowProgram.extends, "./tsconfig.json");
  assert.deepEqual(workflowProgram.compilerOptions.types, ["node"]);
  assert.equal(workflowProgram.compilerOptions.erasableSyntaxOnly, false);
  assert.deepEqual(workflowProgram.include, ["workflows", "shared/workflow.ts"]);
  assert.match(
    read("workflows/sandbox-modules.d.ts"),
    /\/\/\/ <reference types="@codemod\.com\/jssg-types\/main" \/>/,
  );

  // The opt-in benchmark measures the new engine's per-command cost with the
  // same inline composition and ships without joining the verified surface.
  const benchmarkProbe = read("benchmarks/workspace-pass.ts");
  const benchmarkDriver = read("benchmarks/workspace-passes.mjs");
  assert.match(benchmarkProbe, /binding\.references\(\)/);
  assert.match(benchmarkProbe, /createWorkspacePass\(\n  marker:/);
  assert.doesNotMatch(benchmarkProbe, /export default/);
  assert.match(benchmarkDriver, /createBenchmarkWorkflow/);
  assert.match(benchmarkDriver, /createWorkspacePass\(\$\{JSON\.stringify/);
  assert.match(benchmarkDriver, /semanticAnalysis: "workspace"/);
  assert.match(benchmarkDriver, /runWorkflowFile\(\{ workflowPath, target, bridge \}\)/);
  assert.match(benchmarkDriver, /workflows\/analyze\.ts/);
  assert.doesNotMatch(benchmarkDriver, /workflow\.yaml|js_file|HOME: stateDirectory|XDG_/);
});

test("colocates exact analysis rule production, adapters, and fixtures", () => {
  assert.deepEqual(directRuleFolders(analysisDirectory), EXPECTED_ANALYSIS_FOLDERS);
  assert.deepEqual(
    ruleFiles(analysisDirectory, (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")),
    EXPECTED_ANALYSIS_PRODUCTION,
  );
  assert.deepEqual(
    ruleFiles(analysisDirectory, (name) => name.endsWith(".test.ts")),
    EXPECTED_ANALYSIS_TESTS,
  );
  assert.deepEqual(
    ruleFiles(analysisDirectory, (name) => name.endsWith(".fixture.tsx")),
    EXPECTED_ANALYSIS_FIXTURES,
  );
  assertRuleLayout(analysisDirectory, EXPECTED_ANALYSIS_PRODUCTION);
});

test("colocates exact transformation rule production, adapters, and fixtures", () => {
  assert.deepEqual(
    directRuleFolders(transformationsDirectory),
    EXPECTED_TRANSFORM_FOLDERS,
  );
  assert.deepEqual(
    ruleFiles(transformationsDirectory, (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")),
    EXPECTED_TRANSFORM_PRODUCTION,
  );
  assert.deepEqual(
    ruleFiles(transformationsDirectory, (name) => name.endsWith(".test.ts")),
    EXPECTED_TRANSFORM_TESTS,
  );
  assert.deepEqual(
    ruleFiles(transformationsDirectory, (name) => name.endsWith(".fixture.tsx")),
    EXPECTED_TRANSFORM_FIXTURES,
  );
  assertRuleLayout(transformationsDirectory, EXPECTED_TRANSFORM_PRODUCTION, {
    fixturesSubdirectory: true,
  });
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
    ["hydrate", "isServer", "render"],
  );
  // Dynamic is prescribed by upstream prose and by the Babel plugin's
  // auto-import defaults, but no such export exists in the rc.7 runtime
  // source. A list that promises proven bindings must not admit it, and the
  // rule must say why rather than leaving the omission unexplained.
  assert.doesNotMatch(allowlist[1], /Dynamic/);
  assert.match(webRule, /`Dynamic` is deliberately \*\*not\*\* on this list/);

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
    "empty",
    "fixture",
    "packaging.test.mjs",
    "rules.test.mjs",
    "transform-expected",
    "transform-fixture",
    "transform-rules.test.mjs",
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

function read(path) {
  return readFileSync(resolve(packageDirectory, path), "utf8");
}

/**
 * Every inline definition in a workflow module: `const <binding> = jssg({
 * name: "<name>", ... transform: (root) => <adapter>(<rule>, root) })`, with
 * the shared applicability and, for analyzers, workspace semantics.
 */
function definitions(workflow, { adapter, semantic }) {
  const pattern = new RegExp(
    "^const (\\w+) = jssg\\(\\{\\n" +
      '  name: "(\\w+)",\\n' +
      '  language: "tsx",\\n' +
      "  include: SOURCE_INCLUDE,\\n" +
      "  exclude: SOURCE_EXCLUDE,\\n" +
      (semantic ? '  semanticAnalysis: "workspace",\\n' : "") +
      "  output: FileStrings,\\n" +
      "  transform: \\(root\\) => " +
      adapter +
      "\\((\\w+), root\\),\\n" +
      "\\}\\);$",
    "gm",
  );
  return [...workflow.matchAll(pattern)].map(([, binding, name, rule]) => ({
    binding,
    name,
    rule,
  }));
}

function assertNamedImport(workflow, name, specifier) {
  const escaped = specifier.replaceAll(".", "\\.").replaceAll("/", "\\/");
  assert.match(
    workflow,
    new RegExp(`^import \\{[^}]*\\b${name}\\b[^}]*\\} from "${escaped}";$`, "m"),
    `${name} must be imported from ${specifier}`,
  );
  assert.equal(
    (workflow.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length,
    3,
    `${name} appears once in its import, once as a name, and once as the delegated rule`,
  );
}

function listedIdentifiers(workflow, list) {
  const match = new RegExp(`^export const ${list} = \\[([^\\]]*)\\];$`, "m").exec(
    workflow,
  );
  assert.ok(match, `${list} must be an exported array literal`);
  return match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function namedRuleExports(directory, prefix) {
  const pattern = new RegExp(
    "^export function ((?:" + prefix + ")[A-Z][A-Za-z0-9]*)\\(",
    "gm",
  );
  return ruleFiles(directory, (name) =>
    name.endsWith(".ts") && !name.endsWith(".test.ts"),
  ).flatMap((source) => {
    const contents = readFileSync(resolve(directory, source), "utf8");
    return [...contents.matchAll(pattern)].map((match) => ({
      name: match[1],
      source,
    }));
  });
}

function directRuleFolders(directory) {
  const folders = [];
  for (const domain of readdirSync(directory, { withFileTypes: true })) {
    if (!domain.isDirectory()) continue;
    const domainDirectory = resolve(directory, domain.name);
    for (const rule of readdirSync(domainDirectory, { withFileTypes: true })) {
      if (rule.isDirectory()) folders.push(`${domain.name}/${rule.name}`);
    }
  }
  return folders.sort();
}

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

function assertRuleLayout(
  directory,
  productionPaths,
  { fixturesSubdirectory = false } = {},
) {
  for (const entry of ruleEntries(directory)) {
    assert.equal(entry.split("/").includes("__testfixtures__"), false, entry);
    assert.notEqual(basename(entry), "input.tsx", entry);
    assert.notEqual(basename(entry), "expected.tsx", entry);
  }

  for (const production of productionPaths) {
    const folder = dirname(production);
    const ruleName = basename(production, ".ts");
    const entries = readdirSync(resolve(directory, folder), {
      withFileTypes: true,
    });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    assert.deepEqual(
      directories,
      fixturesSubdirectory ? ["fixtures"] : [],
      folder,
    );
    assert.deepEqual(
      files.filter(
        (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
      ),
      [`${ruleName}.ts`],
      folder,
    );
    assert.deepEqual(
      files.filter((name) => name.endsWith(".test.ts")),
      [`${ruleName}.test.ts`],
      folder,
    );
    const fixtureEntries = fixturesSubdirectory
      ? readdirSync(resolve(directory, folder, "fixtures"), {
          withFileTypes: true,
        })
      : entries;
    assert.ok(
      fixtureEntries.some(
        (entry) => entry.isFile() && entry.name.endsWith(".fixture.tsx"),
      ),
      `${folder} must contain at least one fixture`,
    );
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
