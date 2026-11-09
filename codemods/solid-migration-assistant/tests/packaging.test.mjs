import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { DISCLOSURE } from "../shared/run-workflow.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedFiles = [
  "LICENSE",
  "README.md",
  "benchmarks/workspace-pass.ts",
  "benchmarks/workspace-passes.mjs",
  "bin/solid-migration-assistant.mjs",
  "package.json",
  "rules/analysis/imports/beta32-subpaths/beta32-subpaths.ts",
  "rules/analysis/imports/ecosystem-apis/ecosystem-apis.ts",
  "rules/analysis/imports/jsx-types/jsx-types.ts",
  "rules/analysis/imports/web-import/web-import.ts",
  "rules/analysis/jsx/class-list/class-list.ts",
  "rules/analysis/jsx/component-renames/component-renames.ts",
  "rules/analysis/jsx/context-provider/context-provider.ts",
  "rules/analysis/jsx/dom-attr-namespaces/dom-attr-namespaces.ts",
  "rules/analysis/jsx/dom-event-namespaces/dom-event-namespaces.ts",
  "rules/analysis/jsx/dom-lowercase-events/dom-lowercase-events.ts",
  "rules/analysis/jsx/dom-use-directive/dom-use-directive.ts",
  "rules/analysis/jsx/dynamic-component/dynamic-component.ts",
  "rules/analysis/jsx/ref-callback-scope/ref-callback-scope.ts",
  "rules/analysis/lifecycle/on-cleanup/on-cleanup.ts",
  "rules/analysis/lifecycle/on-mount/on-mount.ts",
  "rules/analysis/props/merge-props/merge-props.ts",
  "rules/analysis/props/split-props/split-props.ts",
  "rules/analysis/reactivity/batch/batch.ts",
  "rules/analysis/reactivity/create-computed/create-computed.ts",
  "rules/analysis/reactivity/create-dynamic/create-dynamic.ts",
  "rules/analysis/reactivity/create-effect/create-effect.ts",
  "rules/analysis/reactivity/create-memo/create-memo.ts",
  "rules/analysis/reactivity/create-resource/create-resource.ts",
  "rules/analysis/reactivity/create-selector/create-selector.ts",
  "rules/analysis/reactivity/error-handling/error-handling.ts",
  "rules/analysis/reactivity/from-observable/from-observable.ts",
  "rules/analysis/reactivity/index-array/index-array.ts",
  "rules/analysis/reactivity/nested-create-root/nested-create-root.ts",
  "rules/analysis/reactivity/on-helper/on-helper.ts",
  "rules/analysis/reactivity/transition-apis/transition-apis.ts",
  "rules/analysis/reactivity/utility-renames/utility-renames.ts",
  "rules/analysis/store/mutable/mutable.ts",
  "rules/analysis/store/produce/produce.ts",
  "rules/analysis/store/setter-calls/setter-calls.ts",
  "rules/analysis/store/unwrap/unwrap.ts",
  "rules/transformations/imports/jsx-type-relocation/jsx-type-relocation.ts",
  "rules/transformations/imports/legacy-subpath-relocation/legacy-subpath-relocation.ts",
  "rules/transformations/imports/web-package-relocation/web-package-relocation.ts",
  "rules/transformations/jsx/class-list-to-class/class-list-to-class.ts",
  "rules/transformations/jsx/context-provider-to-context/context-provider-to-context.ts",
  "rules/transformations/jsx/index-to-for/index-to-for.ts",
  "rules/transformations/jsx/lowercase-event-handlers/lowercase-event-handlers.ts",
  "rules/transformations/reactivity/on-helper-split/on-helper-split.ts",
  "rules/transformations/store/setter-literal-paths/setter-literal-paths.ts",
  "scripts/analysis/analyzeBatch.ts",
  "scripts/analysis/analyzeBeta32SubpathImports.ts",
  "scripts/analysis/analyzeCatchError.ts",
  "scripts/analysis/analyzeContextProvider.ts",
  "scripts/analysis/analyzeCreateComputed.ts",
  "scripts/analysis/analyzeCreateDeferred.ts",
  "scripts/analysis/analyzeCreateDynamic.ts",
  "scripts/analysis/analyzeCreateEffect.ts",
  "scripts/analysis/analyzeCreateMemo.ts",
  "scripts/analysis/analyzeCreateMutable.ts",
  "scripts/analysis/analyzeCreateResource.ts",
  "scripts/analysis/analyzeCreateSelector.ts",
  "scripts/analysis/analyzeDomAttrNamespaces.ts",
  "scripts/analysis/analyzeDomEventNamespaces.ts",
  "scripts/analysis/analyzeDomLowercaseEvents.ts",
  "scripts/analysis/analyzeDomUseDirective.ts",
  "scripts/analysis/analyzeDynamicComponent.ts",
  "scripts/analysis/analyzeEcosystemImports.ts",
  "scripts/analysis/analyzeEnableScheduling.ts",
  "scripts/analysis/analyzeEqualFn.ts",
  "scripts/analysis/analyzeFrom.ts",
  "scripts/analysis/analyzeGetListener.ts",
  "scripts/analysis/analyzeIndexArray.ts",
  "scripts/analysis/analyzeJsxClassListAttributes.ts",
  "scripts/analysis/analyzeJsxComponentRenames.ts",
  "scripts/analysis/analyzeJsxTypeImports.ts",
  "scripts/analysis/analyzeMergeProps.ts",
  "scripts/analysis/analyzeModifyMutable.ts",
  "scripts/analysis/analyzeNestedCreateRoot.ts",
  "scripts/analysis/analyzeObservable.ts",
  "scripts/analysis/analyzeOnCleanup.ts",
  "scripts/analysis/analyzeOnError.ts",
  "scripts/analysis/analyzeOnHelper.ts",
  "scripts/analysis/analyzeOnMount.ts",
  "scripts/analysis/analyzeProduce.ts",
  "scripts/analysis/analyzeRefCallbackScope.ts",
  "scripts/analysis/analyzeResetErrorBoundaries.ts",
  "scripts/analysis/analyzeSplitProps.ts",
  "scripts/analysis/analyzeStartTransition.ts",
  "scripts/analysis/analyzeStoreSetterCalls.ts",
  "scripts/analysis/analyzeUnwrap.ts",
  "scripts/analysis/analyzeUseTransition.ts",
  "scripts/analysis/analyzeWebImport.ts",
  "scripts/analysis/analyzeWriteSignal.ts",
  "scripts/emit-report.ts",
  "scripts/transformations/relocateJsxTypes.ts",
  "scripts/transformations/relocateLegacySubpaths.ts",
  "scripts/transformations/relocateWebPackage.ts",
  "scripts/transformations/rewriteClassListToClass.ts",
  "scripts/transformations/rewriteContextProvider.ts",
  "scripts/transformations/rewriteIndexToFor.ts",
  "scripts/transformations/rewriteLowercaseEventHandlers.ts",
  "scripts/transformations/rewriteOnHelper.ts",
  "scripts/transformations/rewriteStoreSetterLiteralPaths.ts",
  "shared/analysis.ts",
  "shared/bindings.ts",
  "shared/dependencies.mjs",
  "shared/entrypoint.ts",
  "shared/imports.ts",
  "shared/jsx.ts",
  "shared/run-workflow.mjs",
  "shared/severity.mjs",
  "shared/target.ts",
  "shared/transform.ts",
  "transform.yaml",
  "workflow.yaml"
];
const expectedDescription =
  "Solid 1.9 to Solid 2 RC migration assistant: read-only analyzer plus deterministic legacy import-path relocation and narrow intrinsic JSX rewrites (classList to class, Context.Provider to Context, Index to For keyed={false}, lowercase event handlers to camelCase) for project-owned JavaScript and TypeScript source";
const expectedKeywords = [
  "solid",
  "solidjs",
  "solid-2",
  "migration",
  "codemod",
  "analyzer",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
];

test("publishes complete public npm and Codemod metadata", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(packageDirectory, "package.json"), "utf8"),
  );
  assert.equal(packageJson.name, "solid-migration-assistant");
  assert.equal(packageJson.version, "0.4.0");
  assert.equal(packageJson.description, expectedDescription);
  assert.deepEqual(packageJson.keywords, expectedKeywords);
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.dependencies.codemod, "1.12.13");
  assert.equal(packageJson.engines.node, ">=20.0.0");
  assert.equal(packageJson.publishConfig.access, "public");
  assert.equal(packageJson.os, undefined);
  assert.equal(packageJson.cpu, undefined);
  assert.equal(packageJson.libc, undefined);
  assert.deepEqual(packageJson.bin, {
    "solid-migration-assistant": "./bin/solid-migration-assistant.mjs",
  });
  assert.equal(packageJson.repository.type, "git");
  assert.match(packageJson.repository.url, /solid-migration-assistant/);
  assert.match(packageJson.homepage, /solid-migration-assistant/);
  assert.match(packageJson.bugs.url, /solid-migration-assistant\/issues/);

  const codemod = readFileSync(
    resolve(packageDirectory, "codemod.yaml"),
    "utf8",
  );
  assert.match(codemod, /^version: "0\.4\.0"$/m);
  const codemodLines = codemod.split("\n");
  assert.ok(codemodLines.includes(`description: "${expectedDescription}"`));
  assert.ok(
    codemodLines.includes('  languages: ["javascript", "typescript"]'),
  );
  assert.ok(
    codemodLines.includes(
      `keywords: [${expectedKeywords.map((keyword) => `"${keyword}"`).join(", ")}]`,
    ),
  );
  assert.match(
    readFileSync(resolve(packageDirectory, "LICENSE"), "utf8"),
    /^MIT License/,
  );

  for (const readme of [
    resolve(packageDirectory, "README.md"),
    resolve(packageDirectory, "../../README.md"),
  ]) {
    const contents = readFileSync(readme, "utf8");
    assert.match(
      contents,
      /assistant itself imposes no operating-system, CPU-architecture, or libc restriction/,
    );
    assert.match(
      contents,
      /Actual execution support depends on native runtime availability from the pinned Codemod 1\.12\.13 dependency/,
    );
    assert.match(
      contents,
      /may persist workflow and task state in normal platform user-data directories/,
    );
  }
});

test(
  "packs only the npm runtime and runs without pnpm on PATH",
  () => {
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), "solid-migration-assistant-package-"),
    );

    try {
      assert.equal(expectedFiles.length, 116);
      const packDirectory = join(temporaryRoot, "pack");
      mkdirSync(packDirectory);
      const pack = command(
        "npm",
        ["pack", "--json", "--pack-destination", packDirectory],
        packageDirectory,
      );
      assert.equal(pack.status, 0, output(pack));
      const manifest = JSON.parse(pack.stdout)[0];
      assert.deepEqual(
        manifest.files.map((file) => file.path).sort(),
        expectedFiles,
      );
      assert.equal(
        manifest.files.find(
          (file) => file.path === "bin/solid-migration-assistant.mjs",
        ).mode,
        0o755,
      );

      const tarball = join(packDirectory, manifest.filename);
      assert.equal(existsSync(tarball), true);

      const consumer = join(temporaryRoot, "consumer");
      mkdirSync(join(consumer, "src"), { recursive: true });
      writeFileSync(
        join(consumer, "package.json"),
        JSON.stringify({ name: "package-smoke", private: true }, null, 2) +
          "\n",
      );
      writeFileSync(
        join(consumer, "src/example.tsx"),
        'import { render } from "solid-js/web";\nvoid render;\n',
      );

      const install = command(
        "npm",
        [
          "install",
          "--no-audit",
          "--no-fund",
          "--no-save",
          "--package-lock=false",
          tarball,
        ],
        consumer,
      );
      assert.equal(install.status, 0, output(install));

      const externalSurface = join(temporaryRoot, "external-surface");
      const analyzerEnvironment =
        controlledAnalyzerEnvironment(externalSurface);

      const executable = join(
        consumer,
        `node_modules/.bin/solid-migration-assistant${
          process.platform === "win32" ? ".cmd" : ""
        }`,
      );
      assert.equal(existsSync(executable), true);
      const before = treeSnapshot(consumer);
      const isolatedPath = join(temporaryRoot, "runtime-bin");
      mkdirSync(isolatedPath);

      let analyzerExecutable = executable;
      let analyzerArguments = [];
      let runtimePath = isolatedPath;
      if (process.platform === "win32") {
        analyzerExecutable = process.execPath;
        analyzerArguments = [
          join(
            consumer,
            "node_modules/solid-migration-assistant/bin/solid-migration-assistant.mjs",
          ),
        ];
        runtimePath = "";
      } else {
        const nodeLink = join(isolatedPath, "node");
        symlinkSync(process.execPath, nodeLink);
        assert.deepEqual(readdirSync(isolatedPath), ["node"]);
        chmodSync(executable, 0o755);
      }

      const smokeRuns = [];
      for (let run = 1; run <= 2; run += 1) {
        const smoke = command(analyzerExecutable, analyzerArguments, consumer, {
          ...analyzerEnvironment,
          PATH: runtimePath,
        });
        smokeRuns.push(smoke);

        assert.equal(smoke.status, 0, `packed run ${run}: ${output(smoke)}`);
        assert.match(smoke.stdout, /Move this Solid web renderer/);
        assert.match(
          smoke.stdout,
          /github\.com\/solidjs\/solid\/blob\/2105ffb8.*imports-where-things-live-now/,
        );
        assert.doesNotMatch(smoke.stdout, /S2-IMPORT-WEB-001/);
        assertFinalDisclosure(smoke.stderr);
        assert.deepEqual(
          treeSnapshot(consumer),
          before,
          `packed run ${run} changed the consumer tree`,
        );
        assertNoAnalyzerArtifacts(consumer);
      }

      assert.deepEqual(
        Buffer.from(smokeRuns[0].stdout, "utf8"),
        Buffer.from(smokeRuns[1].stdout, "utf8"),
        "complete analyzer-owned guidance bytes changed between packed runs",
      );
      const comparableRuns = smokeRuns.map((smoke, index) => {
        // Codemod colors its envelope only when stderr is a terminal (or the
        // platform forces color), so both the colored and the plain spelling
        // of each line are accepted; only the generated values are masked.
        const workflowId =
          /^((?:\u001b\[36m)?Workflow started(?:\u001b\[0m)? (?:\u001b\[2m)?)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})((?:\u001b\[0m)?\r?)$/gm;
        const workflowDuration =
          /^((?:\u001b\[32m)?Workflow completed(?:\u001b\[0m)? (?:\u001b\[2m)?in )([0-9]+(?:\.[0-9]+)?(?:ms|s))((?:\u001b\[0m)?\r?)$/gm;
        assert.equal(
          [...smoke.stderr.matchAll(workflowId)].length,
          1,
          `packed run ${index + 1} workflow UUID envelope`,
        );
        assert.equal(
          [...smoke.stderr.matchAll(workflowDuration)].length,
          1,
          `packed run ${index + 1} workflow timing envelope`,
        );
        const stableProgress = smoke.stderr
          .replace(workflowId, "$1<generated-workflow-uuid>$3")
          .replace(workflowDuration, "$1<generated-workflow-duration>$3");
        return Buffer.concat([
          Buffer.from(stableProgress, "utf8"),
          Buffer.from([0]),
          Buffer.from(smoke.stdout, "utf8"),
        ]);
      });
      assert.deepEqual(
        comparableRuns[0],
        comparableRuns[1],
        "packed runtime output changed outside Codemod's generated UUID/timing values",
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  },
  { timeout: 120_000 },
);

function controlledAnalyzerEnvironment(root) {
  const paths = {
    HOME: join(root, "home"),
    USERPROFILE: join(root, "home"),
    XDG_CONFIG_HOME: join(root, "xdg-config"),
    XDG_DATA_HOME: join(root, "xdg-data"),
    XDG_STATE_HOME: join(root, "xdg-state"),
    XDG_CACHE_HOME: join(root, "xdg-cache"),
    XDG_RUNTIME_DIR: join(root, "xdg-runtime"),
    APPDATA: join(root, "appdata"),
    LOCALAPPDATA: join(root, "local-appdata"),
    TMPDIR: join(root, "temporary"),
    TMP: join(root, "temporary"),
    TEMP: join(root, "temporary"),
  };
  for (const path of new Set(Object.values(paths))) {
    mkdirSync(path, { recursive: true });
  }
  return paths;
}

function command(executable, argumentsList, cwd, environment = {}) {
  return spawnSync(executable, argumentsList, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      FORCE_COLOR: undefined,
      NO_COLOR: "1",
      ...environment,
    },
  });
}

function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function assertFinalDisclosure(value) {
  assert.ok(value.endsWith(`${DISCLOSURE}\n`));
  assert.equal(value.split(DISCLOSURE).length - 1, 1);
}

function assertNoAnalyzerArtifacts(target) {
  for (const path of [
    ".codemod",
    ".codemod-reports",
    "build",
    "coverage",
    "dist",
  ]) {
    assert.equal(existsSync(join(target, path)), false, path);
  }
}

function treeSnapshot(root) {
  const snapshot = {};
  visit(root, root, snapshot);
  return snapshot;
}

function visit(root, directory, snapshot) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      snapshot[`directory:${relativePath}`] = true;
      visit(root, path, snapshot);
      continue;
    }
    if (entry.isSymbolicLink()) {
      snapshot[`symlink:${relativePath}`] = readlinkSync(path);
      continue;
    }
    if (!entry.isFile() || !lstatSync(path).isFile()) continue;
    snapshot[`file:${relativePath}`] = createHash("sha256")
      .update(readFileSync(path))
      .digest("hex");
  }
}
