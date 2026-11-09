import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DISCLOSURE } from "../shared/run-workflow.mjs";
import { explicitSeverity, severityOf } from "../shared/severity.mjs";
import { dependencyHeadline } from "../shared/dependencies.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const analysisDirectory = resolve(packageDirectory, "rules/analysis");
const transformationsDirectory = resolve(packageDirectory, "rules/transformations");
const testsDirectory = resolve(packageDirectory, "tests");

const EXPECTED_ANALYSIS_PRODUCTION = [
  "imports/beta32-subpaths/beta32-subpaths.ts",
  "imports/ecosystem-apis/ecosystem-apis.ts",
  "imports/jsx-types/jsx-types.ts",
  "imports/web-import/web-import.ts",
  "jsx/class-list/class-list.ts",
  "jsx/component-renames/component-renames.ts",
  "jsx/context-provider/context-provider.ts",
  "jsx/dom-attr-namespaces/dom-attr-namespaces.ts",
  "jsx/dom-event-namespaces/dom-event-namespaces.ts",
  "jsx/dom-lowercase-events/dom-lowercase-events.ts",
  "jsx/dom-use-directive/dom-use-directive.ts",
  "jsx/dynamic-component/dynamic-component.ts",
  "jsx/ref-callback-scope/ref-callback-scope.ts",
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
  "reactivity/nested-create-root/nested-create-root.ts",
  "reactivity/on-helper/on-helper.ts",
  "reactivity/transition-apis/transition-apis.ts",
  "reactivity/utility-renames/utility-renames.ts",
  "store/mutable/mutable.ts",
  "store/produce/produce.ts",
  "store/setter-calls/setter-calls.ts",
  "store/unwrap/unwrap.ts",
];
const EXPECTED_ANALYSIS_TESTS = [
  "imports/beta32-subpaths/beta32-subpaths.test.ts",
  "imports/ecosystem-apis/ecosystem-apis.test.ts",
  "imports/jsx-types/jsx-types.test.ts",
  "imports/web-import/web-import.test.ts",
  "jsx/class-list/class-list.test.ts",
  "jsx/component-renames/component-renames.test.ts",
  "jsx/context-provider/context-provider.test.ts",
  "jsx/dom-attr-namespaces/dom-attr-namespaces.test.ts",
  "jsx/dom-event-namespaces/dom-event-namespaces.test.ts",
  "jsx/dom-lowercase-events/dom-lowercase-events.test.ts",
  "jsx/dom-use-directive/dom-use-directive.test.ts",
  "jsx/dynamic-component/dynamic-component.test.ts",
  "jsx/ref-callback-scope/ref-callback-scope.test.ts",
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
  "reactivity/nested-create-root/nested-create-root.test.ts",
  "reactivity/on-helper/on-helper.test.ts",
  "reactivity/transition-apis/transition-apis.test.ts",
  "reactivity/utility-renames/utility-renames.test.ts",
  "store/mutable/mutable.test.ts",
  "store/produce/produce.test.ts",
  "store/setter-calls/setter-calls.test.ts",
  "store/unwrap/unwrap.test.ts",
];
const EXPECTED_ANALYSIS_FIXTURES = [
  "imports/beta32-subpaths/static-imports.fixture.tsx",
  "imports/ecosystem-apis/normal.fixture.tsx",
  "imports/jsx-types/static-imports.fixture.tsx",
  "imports/web-import/static-imports.fixture.tsx",
  "jsx/class-list/normal.fixture.tsx",
  "jsx/component-renames/normal.fixture.tsx",
  "jsx/context-provider/normal.fixture.tsx",
  "jsx/dom-attr-namespaces/normal.fixture.tsx",
  "jsx/dom-event-namespaces/normal.fixture.tsx",
  "jsx/dom-lowercase-events/normal.fixture.tsx",
  "jsx/dom-use-directive/normal.fixture.tsx",
  "jsx/dynamic-component/normal.fixture.tsx",
  "jsx/ref-callback-scope/normal.fixture.tsx",
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
  "reactivity/nested-create-root/direct-call.fixture.tsx",
  "reactivity/nested-create-root/non-solid.fixture.tsx",
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
  "store/setter-calls/direct-call.fixture.tsx",
  "store/setter-calls/non-solid.fixture.tsx",
  "store/unwrap/direct-call.fixture.tsx",
  "store/unwrap/non-solid.fixture.tsx",
];

const EXPECTED_ANALYSIS_FOLDERS = EXPECTED_ANALYSIS_PRODUCTION.map((path) =>
  dirname(path),
).sort();

const EXPECTED_TRANSFORM_PRODUCTION = [
  "imports/jsx-type-relocation/jsx-type-relocation.ts",
  "imports/legacy-subpath-relocation/legacy-subpath-relocation.ts",
  "imports/web-package-relocation/web-package-relocation.ts",
  "jsx/class-list-to-class/class-list-to-class.ts",
  "jsx/context-provider-to-context/context-provider-to-context.ts",
  "jsx/index-to-for/index-to-for.ts",
  "jsx/lowercase-event-handlers/lowercase-event-handlers.ts",
  "reactivity/on-helper-split/on-helper-split.ts",
  "store/setter-literal-paths/setter-literal-paths.ts",
];
const EXPECTED_TRANSFORM_TESTS = [
  "imports/jsx-type-relocation/jsx-type-relocation.test.ts",
  "imports/legacy-subpath-relocation/legacy-subpath-relocation.test.ts",
  "imports/web-package-relocation/web-package-relocation.test.ts",
  "jsx/class-list-to-class/class-list-to-class.test.ts",
  "jsx/context-provider-to-context/context-provider-to-context.test.ts",
  "jsx/index-to-for/index-to-for.test.ts",
  "jsx/lowercase-event-handlers/lowercase-event-handlers.test.ts",
  "reactivity/on-helper-split/on-helper-split.test.ts",
  "store/setter-literal-paths/setter-literal-paths.test.ts",
];
const EXPECTED_TRANSFORM_FIXTURES = [
  "imports/jsx-type-relocation/fixtures/jsx-element-conflicts.fixture.tsx",
  "imports/jsx-type-relocation/fixtures/jsx-element-mixed.fixture.tsx",
  "imports/jsx-type-relocation/fixtures/jsx-element-value-use.fixture.tsx",
  "imports/jsx-type-relocation/fixtures/jsx-element.fixture.tsx",
  "imports/jsx-type-relocation/fixtures/mixed-statements.fixture.tsx",
  "imports/jsx-type-relocation/fixtures/no-matches.fixture.tsx",
  "imports/jsx-type-relocation/fixtures/pragma-forms.fixture.tsx",
  "imports/jsx-type-relocation/fixtures/relocations.fixture.tsx",
  "imports/jsx-type-relocation/fixtures/split-refusals.fixture.tsx",
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
  "imports/web-package-relocation/fixtures/dynamic-bindings.fixture.tsx",
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
  "jsx/class-list-to-class/fixtures/class-merge-refusals.fixture.tsx",
  "jsx/class-list-to-class/fixtures/class-merges.fixture.tsx",
  "jsx/class-list-to-class/fixtures/no-matches.fixture.tsx",
  "jsx/class-list-to-class/fixtures/non-intrinsic-elements.fixture.tsx",
  "jsx/class-list-to-class/fixtures/rewrites.fixture.tsx",
  "jsx/class-list-to-class/fixtures/spread-attributes.fixture.tsx",
  "jsx/context-provider-to-context/fixtures/aliased-import.fixture.tsx",
  "jsx/context-provider-to-context/fixtures/attribute-shapes.fixture.tsx",
  "jsx/context-provider-to-context/fixtures/lowercase-names.fixture.tsx",
  "jsx/context-provider-to-context/fixtures/no-matches.fixture.tsx",
  "jsx/context-provider-to-context/fixtures/real-world-solid-context-spec.fixture.tsx",
  "jsx/context-provider-to-context/fixtures/rewrites.fixture.tsx",
  "jsx/context-provider-to-context/fixtures/shadowed-bindings.fixture.tsx",
  "jsx/context-provider-to-context/fixtures/shadowed-create-context.fixture.tsx",
  "jsx/context-provider-to-context/fixtures/unproven-contexts.fixture.tsx",
  "jsx/index-to-for/fixtures/attribute-shapes.fixture.tsx",
  "jsx/index-to-for/fixtures/for-conflicts.fixture.tsx",
  "jsx/index-to-for/fixtures/for-imported-after.fixture.tsx",
  "jsx/index-to-for/fixtures/for-imported-before.fixture.tsx",
  "jsx/index-to-for/fixtures/import-shapes.fixture.tsx",
  "jsx/index-to-for/fixtures/no-matches.fixture.tsx",
  "jsx/index-to-for/fixtures/real-world-solid-primitives-active-element.fixture.tsx",
  "jsx/index-to-for/fixtures/rewrites.fixture.tsx",
  "jsx/index-to-for/fixtures/separate-for-import.fixture.tsx",
  "jsx/index-to-for/fixtures/shadowed-bindings.fixture.tsx",
  "jsx/index-to-for/fixtures/shorthand-pattern.fixture.tsx",
  "jsx/index-to-for/fixtures/shorthand-references.fixture.tsx",
  "jsx/index-to-for/fixtures/type-arguments.fixture.tsx",
  "jsx/index-to-for/fixtures/unsupported-references.fixture.tsx",
  "jsx/index-to-for/fixtures/web-import.fixture.tsx",
  "jsx/lowercase-event-handlers/fixtures/attribute-values.fixture.tsx",
  "jsx/lowercase-event-handlers/fixtures/conflicts.fixture.tsx",
  "jsx/lowercase-event-handlers/fixtures/no-matches.fixture.tsx",
  "jsx/lowercase-event-handlers/fixtures/non-intrinsic-elements.fixture.tsx",
  "jsx/lowercase-event-handlers/fixtures/real-world-solid-primitives-memo-lazy.fixture.tsx",
  "jsx/lowercase-event-handlers/fixtures/rewrites.fixture.tsx",
  "jsx/lowercase-event-handlers/fixtures/spread-attributes.fixture.tsx",
  "jsx/lowercase-event-handlers/fixtures/unknown-events.fixture.tsx",
  "reactivity/on-helper-split/fixtures/import-kept.fixture.tsx",
  "reactivity/on-helper-split/fixtures/no-matches.fixture.tsx",
  "reactivity/on-helper-split/fixtures/refusals.fixture.tsx",
  "reactivity/on-helper-split/fixtures/rewrites.fixture.tsx",
  "reactivity/on-helper-split/fixtures/shadowed.fixture.tsx",
  "store/setter-literal-paths/fixtures/aliased-with-store-type.fixture.tsx",
  "store/setter-literal-paths/fixtures/import-stays.fixture.tsx",
  "store/setter-literal-paths/fixtures/no-matches.fixture.tsx",
  "store/setter-literal-paths/fixtures/partial.fixture.tsx",
  "store/setter-literal-paths/fixtures/rewrites.fixture.tsx",
  "store/setter-literal-paths/fixtures/store-not-literal.fixture.tsx",
  "store/setter-literal-paths/fixtures/unproven-setters.fixture.tsx",
  "store/setter-literal-paths/fixtures/unused-or-passed.fixture.tsx",
];
const EXPECTED_TRANSFORM_FOLDERS = EXPECTED_TRANSFORM_PRODUCTION.map((path) =>
  dirname(path),
).sort();

test("composes every named rule as its own workflow step", () => {
  const analyzeWorkflow = readFileSync(
    resolve(packageDirectory, "workflow.yaml"),
    "utf8",
  );
  const transformWorkflow = readFileSync(
    resolve(packageDirectory, "transform.yaml"),
    "utf8",
  );
  const analysisRules = namedRuleExports(analysisDirectory, "analyze");
  const transformRules = namedRuleExports(
    transformationsDirectory,
    "relocate|rewrite",
  );
  const analysisEntrypoints = analysisRules.map(
    ({ name }) => "scripts/analysis/" + name + ".ts",
  );
  const transformEntrypoints = transformRules.map(
    ({ name }) => "scripts/transformations/" + name + ".ts",
  );

  assert.equal(analysisRules.length, 44);
  assert.equal(transformRules.length, 9);
  assert.deepEqual(
    [...analyzeWorkflow.matchAll(/js_file:\s*(\S+)/g)].map(
      (match) => match[1],
    ),
    [...analysisEntrypoints, "scripts/emit-report.ts"],
  );
  assert.deepEqual(
    [...transformWorkflow.matchAll(/js_file:\s*(\S+)/g)].map(
      (match) => match[1],
    ),
    [...transformEntrypoints, "scripts/emit-report.ts"],
  );

  for (const { name, source } of [...analysisRules, ...transformRules]) {
    const kind = name.startsWith("analyze") ? "analysis" : "transformations";
    const path = resolve(packageDirectory, "scripts", kind, name + ".ts");
    assert.equal(existsSync(path), true, name);
    const entrypoint = readFileSync(path, "utf8");
    assert.equal(entrypoint.includes("import { " + name + " }"), true, name);
    assert.equal(
      entrypoint.includes("../../rules/" + kind + "/" + source),
      true,
      source,
    );
    assert.equal(
      (entrypoint.match(/from "\.\.\/\.\.\/rules\//g) ?? []).length,
      1,
      name,
    );
    const factory =
      kind === "analysis"
        ? "createAnalysisEntrypoint"
        : "createTransformEntrypoint";
    assert.equal(
      entrypoint.includes("export default " + factory + "(" + name + ");"),
      true,
      name,
    );
    assert.doesNotMatch(entrypoint, /\[[^\]]*rule|flatMap|for \(/);
  }

  // Exactly one entrypoint file per named rule: no strays, duplicates, or
  // leftover central scripts anywhere under scripts/, and only one analyze
  // workflow file.
  assert.deepEqual(productionScripts(), ["emit-report.ts"]);
  assert.deepEqual(workflowFiles(), ["workflow.yaml"]);
  assert.deepEqual(
    readdirSync(resolve(packageDirectory, "scripts/analysis")).sort(),
    analysisRules.map(({ name }) => name + ".ts").sort(),
  );
  assert.deepEqual(
    readdirSync(resolve(packageDirectory, "scripts/transformations")).sort(),
    transformRules.map(({ name }) => name + ".ts").sort(),
  );

  // Every workflow step must reference a packaged entrypoint, and the opt-in
  // benchmark must ship but stay out of the verified test surface.
  const packageJson = JSON.parse(
    readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
  );
  for (const workflow of [analyzeWorkflow, transformWorkflow]) {
    for (const [, jsFile] of workflow.matchAll(/js_file:\s*(\S+)/g)) {
      assert.equal(packageJson.files.includes(jsFile), true, jsFile);
    }
  }
  for (const shipped of [
    "shared/entrypoint.ts",
    "benchmarks/workspace-pass.ts",
    "benchmarks/workspace-passes.mjs",
  ]) {
    assert.equal(packageJson.files.includes(shipped), true, shipped);
  }
  for (const script of ["test", "verify", "check-types", "validate"]) {
    assert.doesNotMatch(packageJson.scripts[script], /benchmark/, script);
  }
  const benchmarkProbe = readFileSync(
    resolve(packageDirectory, "benchmarks/workspace-pass.ts"),
    "utf8",
  );
  const benchmarkDriver = readFileSync(
    resolve(packageDirectory, "benchmarks/workspace-passes.mjs"),
    "utf8",
  );
  assert.match(benchmarkProbe, /binding\.references\(\)/);
  assert.match(benchmarkProbe, /createWorkspacePass\(marker:/);
  assert.match(benchmarkDriver, /createBenchmarkWorkflow/);
  assert.match(benchmarkDriver, /createWorkspacePass\(\$\{JSON\.stringify/);
  assert.match(benchmarkDriver, /HOME: stateDirectory/);
  assert.match(benchmarkDriver, /XDG_CACHE_HOME/);
  assert.match(benchmarkDriver, /XDG_DATA_HOME/);

  assert.equal(
    (analyzeWorkflow.match(/semantic_analysis: workspace/g) ?? []).length,
    analysisRules.length,
  );
  assert.doesNotMatch(analyzeWorkflow, /semantic_analysis: file/);
  assert.doesNotMatch(transformWorkflow, /semantic_analysis/);
  assert.equal((analyzeWorkflow.match(/max_threads: 1/g) ?? []).length, 1);
  assert.equal((transformWorkflow.match(/max_threads: 1/g) ?? []).length, 1);

  for (const [workflow, stepCount] of [
    [analyzeWorkflow, analysisRules.length + 1],
    [transformWorkflow, transformRules.length + 1],
  ]) {
    for (const extension of ["js", "jsx", "ts", "tsx"]) {
      assert.equal(
        (workflow.match(new RegExp('- "\\*\\*/\\*\\.' + extension + '"', "g")) ?? [])
          .length,
        stepCount,
        extension,
      );
    }
    for (const exclusion of ["node_modules", "dist", "build", "coverage"]) {
      assert.equal(
        (workflow.match(new RegExp('- "\\*\\*/' + exclusion + '/\\*\\*"', "g")) ?? [])
          .length,
        stepCount,
        exclusion,
      );
    }
    assert.equal(
      (workflow.match(/- "\*\*\/\*\.d\.ts"/g) ?? []).length,
      stepCount,
    );
  }

  for (const obsolete of ["scripts/analyze.ts", "scripts/transform.ts"]) {
    assert.equal(existsSync(resolve(packageDirectory, obsolete)), false, obsolete);
  }
  const sharedEntrypoint = readFileSync(
    resolve(packageDirectory, "shared/entrypoint.ts"),
    "utf8",
  );
  assert.match(sharedEntrypoint, /createAnalysisEntrypoint\(rule:/);
  assert.match(sharedEntrypoint, /createTransformEntrypoint\(rule:/);
  assert.doesNotMatch(sharedEntrypoint, /rules:|flatMap|composeTransformChanges/);
  assert.doesNotMatch(
    readFileSync(resolve(packageDirectory, "shared/transform.ts"), "utf8"),
    /composeTransformChanges|overlapping transform edits/,
  );
});

test("retains one deterministic report emitter after all rule steps", () => {
  const emitter = readFileSync(
    resolve(packageDirectory, "scripts/emit-report.ts"),
    "utf8",
  );
  assert.match(emitter, /\.sort\(\)/);
  assert.doesNotMatch(emitter, /localeCompare|compareGuidance/);
  assert.equal((emitter.match(/console\.log\(/g) ?? []).length, 1);
  const analysis = readFileSync(
    resolve(packageDirectory, "shared/analysis.ts"),
    "utf8",
  );
  assert.doesNotMatch(analysis, /compareGuidance|guidanceLocation|siteGuidance/);
});

test("exposes analyze and transform workflows", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
  );
  const codemod = readFileSync(
    resolve(packageDirectory, "codemod.yaml"),
    "utf8",
  );

  assert.equal(typeof packageJson.scripts.analyze, "string");
  assert.equal(typeof packageJson.scripts.transform, "string");
  assert.deepEqual(
    Object.keys(packageJson.scripts)
      .filter((name) => /^test:transform/.test(name))
      .sort(),
    ["test:transform", "test:transform-rules"],
  );
  assert.match(codemod, /- name: analyze/);
  assert.match(codemod, /- name: transform/);
  assert.doesNotMatch(codemod, /name: write|report\.yaml/i);
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

  // The JSX rewrites stay on JSX syntax: only the Index rule may touch an
  // import statement (to rename or remove the Index specifier), and none of
  // them may rewrite a module source string.
  for (const [rule, touchesImports] of [
    ["jsx/context-provider-to-context/context-provider-to-context.ts", true],
    ["jsx/index-to-for/index-to-for.ts", true],
    ["jsx/lowercase-event-handlers/lowercase-event-handlers.ts", false],
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
    "helpers.mjs",
    "packaging.test.mjs",
    "rc-compat",
    "rc-compat.test.mjs",
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

test("assigns every analyzer headline an explicit severity tier", () => {
  // Headlines come from three places: every literal headline template in the
  // analyzer sources, the exact end-to-end guidance, and every headline the
  // corpus baseline recorded on real projects. Templated headlines are
  // expanded by hand below; a new analyzer headline must be added to
  // shared/severity.mjs before this test passes.
  const headlines = new Set();
  for (const file of ruleFiles(analysisDirectory, (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
    const source = readFileSync(resolve(analysisDirectory, file), "utf8");
    for (const match of source.matchAll(/(?:\}|:1:1) ((?:Manual review required: |Move this )[^\n`$]*?\.)$/gm)) {
      headlines.add(match[1]);
    }
  }
  for (const form of ["static import", "re-export", "dynamic import()", "require() call"]) {
    headlines.add(`Move this Solid web renderer ${form}.`);
    headlines.add(`Move this Solid 2 legacy subpath ${form}.`);
  }
  for (const name of ["JSX", "JSXElement"]) headlines.add(`Manual review required: move this ${name} type import off solid-js.`);
  for (const prefix of ["on:", "oncapture:"]) {
    headlines.add(`Manual review required: migrate this ${prefix}event namespace attribute to Solid 2 event handling.`);
  }
  headlines.add("Manual review required: migrate this lowercase onclick attribute to a camelCase event handler.");
  for (const count of ["zero", "two", "three"]) headlines.add(`Manual review required: migrate this ${count}-argument createEffect call.`);
  for (const label of [".loading access", ".error access", ".refetch() call", ".mutate() call"]) {
    headlines.add(`Manual review required: migrate this ${label}.`);
  }
  for (const name of ["equalFn", "getListener"]) headlines.add(`Manual review required: migrate this ${name} reference to its Solid 2 replacement.`);
  for (const name of ["writeSignal", "enableScheduling"]) headlines.add(`Manual review required: remove this ${name} call.`);
  for (const name of ["startTransition", "useTransition"]) headlines.add(`Manual review required: migrate this ${name} call to Solid 2 built-in transitions.`);
  headlines.add("Manual review required: review this createDeferred call against its Solid 2 meaning.");
  headlines.add("Manual review required: move this onCleanup out of the createEffect callback into the apply callback's returned cleanup.");
  headlines.add("Manual review required: rewrite this path-style store setter call as a draft write. This call passes 3 arguments.");
  headlines.add("Manual review required: rewrite this object-merge store setter call as draft assignments. The argument is an object.");
  headlines.add("Manual review required: move this project's Solid dependencies to solid-js@2.0.0-rc.21.");
  for (const status of ["upgrade", "replace", "use-core", "blocked"]) {
    headlines.add(dependencyHeadline({ name: "@scope/package", status }));
  }
  headlines.add("Manual review required: migrate this A import from @solidjs/router, which Solid 2 removes or moves.");
  headlines.add("Manual review required: migrate this defineConfig import from @solidjs/start/config, which Solid 2 removes or moves.");
  headlines.add("Manual review required: migrate this getCookie import from vinxi/http, which Solid 2 removes or moves.");
  headlines.add("Manual review required: migrate this @solidjs/start/server import, which has no Solid 2 release.");
  headlines.add("Manual review required: review this revalidate import from @solidjs/router, whose Solid 2 behavior changed.");
  headlines.add("Manual review required: review this Meta import from @solidjs/meta, whose Solid 2 behavior changed.");
  headlines.add("Manual review required: replace this deprecated action import from @solidjs/router.");
  const workflowTest = readFileSync(resolve(testsDirectory, "workflow.test.mjs"), "utf8");
  for (const match of workflowTest.matchAll(/^ {2}'[^:']+:\d+:\d+ ([^\\]+?)\\n/gm)) headlines.add(match[1]);
  const baseline = JSON.parse(readFileSync(resolve(testsDirectory, "corpus/baseline.json"), "utf8"));
  for (const entry of Object.values(baseline)) for (const headline of Object.keys(entry.analyzerFindings)) headlines.add(headline);

  const unclassified = [...headlines].filter((headline) => explicitSeverity(headline) === null).sort();
  assert.deepEqual(unclassified, [], "every analyzer headline needs an explicit tier in shared/severity.mjs");
  assert.equal(severityOf("Manual review required: replace this deprecated Dynamic element with a dynamic() factory."), "deprecated");
  assert.equal(severityOf("Manual review required: migrate this lowercase onclick attribute to a camelCase event handler."), "behavior");
  assert.equal(severityOf("Move this Solid web renderer static import."), "build");
});

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
