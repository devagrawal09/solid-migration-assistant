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
import { generatedFiles } from "../tools/generate.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The shipped list is derived (tools/generate.mjs writes package.json#files),
// so the checks here are about what it must and must not contain.
const expectedFiles = [
  ...JSON.parse(generatedFiles().get("package.json")).files,
  "package.json",
].sort();

test("ships every module a shipped file imports, and nothing test-only", () => {
  const shipped = new Set(expectedFiles);
  for (const file of expectedFiles) {
    assert.doesNotMatch(file, /(?:^|\/)(?:tests|tools|fixtures)\/|\.test\.|\.expected\.|\.fixture\./, file);
    if (!/\.(?:ts|mjs)$/.test(file)) continue;
    const source = readFileSync(join(packageDirectory, file), "utf8");
    for (const [, specifier] of source.matchAll(/(?:from|import)\s*\(?\s*"(\.{1,2}\/[^"]+)"/g)) {
      const resolved = relative(packageDirectory, join(dirname(join(packageDirectory, file)), specifier)).replaceAll("\\", "/");
      assert.ok(shipped.has(resolved) || resolved === "package.json", `${file} imports ${specifier}, which is not shipped`);
    }
  }
  for (const required of ["bin/solid-migration-assistant.mjs", "workflow.yaml", "transform.yaml", "scripts/emit-report.ts", "shared/format.mjs"]) {
    assert.ok(shipped.has(required), required);
  }
});
const expectedDescription =
  "Solid 1.9 to Solid 2 RC migration assistant: read-only analyzer plus deterministic legacy import-path relocation and narrow intrinsic JSX rewrites (classList to class, Context.Provider to Context, Index to For keyed={false}, Suspense to Loading, ErrorBoundary to Errored, lowercase event handlers to camelCase) for project-owned JavaScript and TypeScript source";
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
