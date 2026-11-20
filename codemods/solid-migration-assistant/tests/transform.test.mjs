import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCodemodLauncher } from "../shared/run-workflow.mjs";
import { output, treeSnapshot } from "./helpers.mjs";

/**
 * Runs the transform workflow end to end on `tests/transform-fixture` and
 * proves that:
 *
 * - the rewritten tree equals `tests/transform-expected` exactly;
 * - the launcher's text and JSON reports equal `tests/fixture-expected/
 *   transform.txt` and `transform.json`, and the workflow's own report when
 *   Codemod runs it directly equals `transform.registry.txt`;
 * - a second run changes nothing and reports nothing (idempotence); and
 * - no run leaves analyzer artifacts in the target.
 *
 * `pnpm fixtures:update` rewrites the expected reports (not the tree).
 */
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = resolve(packageDirectory, "tests/transform-fixture");
const expectedTree = resolve(packageDirectory, "tests/transform-expected");
const expectedDirectory = resolve(packageDirectory, "tests/fixture-expected");
const analyzerLauncher = resolve(packageDirectory, "bin/solid-migration-assistant.mjs");
const update = process.argv.includes("--update");

const temporaryRoot = mkdtempSync(join(tmpdir(), "solid-migration-assistant-transform-"));
const mismatches = [];
try {
  const fresh = (name) => {
    const target = join(temporaryRoot, name);
    cpSync(fixtureDirectory, target, { recursive: true });
    return target;
  };

  const target = fresh("text");
  const text = runLauncher(["transform", "--allow-dirty", "--no-install", "--target", target]);
  assert.equal(text.status, 0, output(text));
  assert.doesNotMatch(text.stderr, /codemod::runtime|Error:/, "a rule reported a runtime error");
  assert.deepEqual(treeSnapshot(target), treeSnapshot(expectedTree), "the rewritten tree differs from tests/transform-expected");
  compare("transform.txt", normalize(text.stdout, target));

  const second = runLauncher(["transform", "--allow-dirty", "--no-install", "--target", target, "--format", "json"]);
  assert.equal(second.status, 0, output(second));
  assert.deepEqual(treeSnapshot(target), treeSnapshot(expectedTree), "a second transform run changed the target (not idempotent)");
  assert.deepEqual(JSON.parse(second.stdout).rewrites, [], "a second transform run re-reported rewrites (not idempotent)");
  assertNoPersistentArtifacts(target);

  const jsonTarget = fresh("json");
  const json = runLauncher(["transform", "--allow-dirty", "--no-install", "--target", jsonTarget, "--format", "json"]);
  assert.equal(json.status, 0, output(json));
  compare("transform.json", normalize(json.stdout, jsonTarget));

  const directTarget = fresh("direct");
  const direct = spawnSync(
    process.execPath,
    [resolveCodemodLauncher(), "--disable-analytics", "workflow", "run", "-w", packageDirectory, "-t", directTarget, "--allow-dirty", "--no-interactive", "--param", "mode=migrate", "--param", "verify=false", "--param", "install=false"],
    { cwd: packageDirectory, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } },
  );
  assert.equal(direct.status, 0, output(direct));
  assert.deepEqual(treeSnapshot(directTarget), treeSnapshot(expectedTree));
  compare("transform.registry.txt", stepOutput(normalize(`${direct.stdout}\n${direct.stderr}`, directTarget)));

  // A pnpm workspace whose app is create-vite's Solid template, with
  // solid-js and the Vite plugin in the default catalog (as codeimage keeps
  // them): the catalog in pnpm-workspace.yaml, the nested package.json, and
  // the Vite plugin's package and imports (vite.config.ts and a
  // vitest.config.mts, which SOURCES leaves out) all move together.
  const workspace = join(temporaryRoot, "workspace");
  const files = {
    "package.json": `${JSON.stringify({ name: "root", private: true }, null, 2)}\n`,
    "pnpm-workspace.yaml": "packages:\n  - packages/*\ncatalog:\n  solid-js: ^1.9.18\n  vite-plugin-solid: ^2.11.15 # Vite plugin\n",
    "packages/app/package.json": `${JSON.stringify({ name: "app", private: true, dependencies: { "solid-js": "catalog:" }, devDependencies: { vite: "^8.3.6", "vite-plugin-solid": "catalog:", "solid-testing-library": "^0.5.1", "babel-preset-solid": "^1.9.19" } }, null, 2)}\n`,
    "packages/app/vite.config.ts": "import { defineConfig } from 'vite'\nimport solid from 'vite-plugin-solid'\n\nexport default defineConfig({\n  plugins: [solid()],\n})\n",
    "packages/app/vitest.config.mts": 'import solidPlugin from "vite-plugin-solid";\nexport default { plugins: [solidPlugin({ hot: false })], esbuild: { jsxImportSource: "solid-js" } };\n',
    "packages/app/src/App.test.tsx": 'import { render } from "solid-testing-library";\nexport const mount = () => render(() => <p />);\n',
    // Babel for the tests: a JSON config and a JavaScript one. babel-preset-solid
    // moves to plugins with the package swap.
    "packages/app/.babelrc": '{\n  // Solid for Jest\n  "presets": [["solid", { "generate": "ssr" }], "@babel/preset-typescript"]\n}\n',
    "packages/app/babel.config.cjs": 'module.exports = { presets: ["babel-preset-solid"], plugins: ["macros"] };\n',
    // A package whose babel-preset-solid range migrate can't swap keeps its config.
    "packages/legacy/package.json": `${JSON.stringify({ name: "legacy", private: true, dependencies: { "solid-js": "^1.9.18" }, devDependencies: { "babel-preset-solid": "latest" } }, null, 2)}\n`,
    "packages/legacy/babel.config.json": '{ "presets": ["solid"] }\n',
    "packages/legacy/babel.config.js": 'export default { presets: ["solid"] };\n',
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(workspace, path)), { recursive: true });
    writeFileSync(join(workspace, path), text);
  }
  const migrated = spawnSync(
    process.execPath,
    [resolveCodemodLauncher(), "--disable-analytics", "workflow", "run", "-w", packageDirectory, "-t", workspace, "--allow-dirty", "--no-interactive", "--param", "mode=migrate", "--param", "verify=false", "--param", "install=false"],
    { cwd: packageDirectory, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } },
  );
  assert.equal(migrated.status, 0, output(migrated));
  const read = (path) => readFileSync(join(workspace, path), "utf8");
  assert.equal(read("pnpm-workspace.yaml"), 'packages:\n  - packages/*\ncatalog:\n  solid-js: ^2.0.3\n  "@solidjs/web": ^2.0.3\n  "@solidjs/vite-plugin": ^3.0.1 # Vite plugin\n');
  assert.deepEqual(JSON.parse(read("packages/app/package.json")), {
    name: "app",
    private: true,
    dependencies: { "solid-js": "catalog:", "@solidjs/web": "catalog:" },
    devDependencies: { vite: "^8.3.6", "@solidjs/vite-plugin": "catalog:", "@solidjs/testing-library": "1.0.0-rc.2", "@solidjs/babel-plugin": "^2.0.2" },
  });
  assert.equal(read("packages/app/.babelrc"), '{\n  // Solid for Jest\n  "presets": ["@babel/preset-typescript"],\n  "plugins": [["@solidjs/babel-plugin", { "generate": "ssr" }]]\n}\n');
  assert.equal(read("packages/app/babel.config.cjs"), 'module.exports = { plugins: ["macros", "@solidjs/babel-plugin"] };\n');
  assert.equal(read("packages/legacy/babel.config.json"), files["packages/legacy/babel.config.json"]);
  assert.equal(read("packages/legacy/babel.config.js"), files["packages/legacy/babel.config.js"]);
  assert.equal(read("packages/app/vite.config.ts"), files["packages/app/vite.config.ts"].replace("'vite-plugin-solid'", "'@solidjs/vite-plugin'"));
  assert.equal(read("packages/app/vitest.config.mts"), files["packages/app/vitest.config.mts"].replace('"vite-plugin-solid"', '"@solidjs/vite-plugin"').replace('"solid-js"', '"@solidjs/web"'));
  assert.equal(read("packages/app/src/App.test.tsx"), files["packages/app/src/App.test.tsx"].replace("solid-testing-library", "@solidjs/testing-library"));
  // What's left is the plugin option that changed, in the Still to do list.
  const report = stepOutput(normalize(`${migrated.stdout}\n${migrated.stderr}`, workspace));
  assert.match(report, /^packages\/app\/vitest\.config\.mts:2:42 \[build\] Remove the hot option; @solidjs\/vite-plugin has none\.$/m);
  assert.match(report, /^packages\/app\/\.babelrc:3:16 Move babel-preset-solid from presets to plugins as @solidjs\/babel-plugin, its Solid 2 successor\.$/m);
  assert.match(report, /^packages\/app\/babel\.config\.cjs:1:30 Move babel-preset-solid from presets to plugins/m);
  // The package left on babel-preset-solid keeps its configs, which are still to do.
  assert.match(report, /^packages\/legacy\/babel\.config\.json:1:15 \[build\] Replace the babel-preset-solid preset/m);
  assert.match(report, /^packages\/legacy\/babel\.config\.js:1:28 \[build\] Replace the babel-preset-solid preset/m);
  assert.doesNotMatch(report.replace(/^.*packages\/legacy.*$/gm, ""), /project\/solid-version|Replace vite-plugin-solid with its Solid 2 successor\./);

  // The same app as the target, with the workspace file above it (as the
  // corpus runs codeimage): migrate can't swap the catalog, so it leaves the
  // plugin and its imports alone and adds no @solidjs/web the catalog lacks,
  // and says what to move. Nothing imports a package nothing installs.
  const outside = join(temporaryRoot, "outside");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(outside, path)), { recursive: true });
    writeFileSync(join(outside, path), text);
  }
  const app = join(outside, "packages/app");
  const appRun = spawnSync(
    process.execPath,
    [resolveCodemodLauncher(), "--disable-analytics", "workflow", "run", "-w", packageDirectory, "-t", app, "--allow-dirty", "--no-interactive", "--param", "mode=migrate", "--param", "verify=false", "--param", "install=false"],
    { cwd: packageDirectory, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } },
  );
  assert.equal(appRun.status, 0, output(appRun));
  const appManifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  assert.deepEqual(appManifest.dependencies, { "solid-js": "catalog:" });
  assert.equal(appManifest.devDependencies["vite-plugin-solid"], "catalog:");
  assert.equal(readFileSync(join(app, "vite.config.ts"), "utf8"), files["packages/app/vite.config.ts"]);
  assert.match(readFileSync(join(app, "vitest.config.mts"), "utf8"), /from "vite-plugin-solid"/);
  // solid-testing-library has a plain range, so it moves with its import.
  assert.equal(appManifest.devDependencies["@solidjs/testing-library"], "1.0.0-rc.2");
  assert.match(readFileSync(join(app, "src/App.test.tsx"), "utf8"), /from "@solidjs\/testing-library"/);
  const appReport = stepOutput(normalize(`${appRun.stdout}\n${appRun.stderr}`, app));
  assert.match(appReport, /^  package\.json: vite-plugin-solid "catalog:" \(it isn't a plain semver range; replace it with @solidjs\/vite-plugin \^3\.0\.1\)$/m);
  assert.match(appReport, /^  package\.json: @solidjs\/web "catalog:" \(solid-js comes from a workspace catalog migrate couldn't edit/m);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

if (mismatches.length > 0) {
  console.error(`${mismatches.join("\n\n")}\n\nIf intended, run \`pnpm fixtures:update\` and review the diff.`);
  process.exit(1);
}
console.log(update ? "Updated the transform reports in tests/fixture-expected." : "Transform passed: expected tree, 3 expected reports, idempotent second run, workspace with a catalog and build configs, and an app whose catalog is out of reach.");

function compare(name, actual) {
  const path = join(expectedDirectory, name);
  if (update) {
    mkdirSync(expectedDirectory, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  const expected = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (expected === actual) return;
  const left = (expected ?? "").split("\n");
  const right = actual.split("\n");
  const index = left.findIndex((line, position) => line !== right[position]);
  const at = index === -1 ? left.length : index;
  mismatches.push(
    `tests/fixture-expected/${name} differs at line ${at + 1}\n  expected: ${left[at] ?? "(end of file)"}\n  actual:   ${right[at] ?? "(end of file)"}`,
  );
}

function normalize(text, target) {
  return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replaceAll(target, "<target>");
}

/** The workflow's console output: everything but Codemod's run and step progress lines. */
function stepOutput(text) {
  return `${text
    .split("\n")
    .filter((line) => !/^(?:[▸✓◐✗] |Run [0-9a-f-]{36}$|Done\b)/.test(line))
    .join("\n")
    .trim()}\n`;
}

function runLauncher(argumentsList) {
  return spawnSync(process.execPath, [analyzerLauncher, ...argumentsList], {
    cwd: packageDirectory,
    encoding: "utf8",
    env: { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: undefined },
    maxBuffer: 64 * 1024 * 1024,
  });
}

function assertNoPersistentArtifacts(target) {
  for (const path of [".codemod", ".codemod-reports", "build", "coverage", "dist"]) {
    assert.equal(existsSync(join(target, path)), false, path);
  }
}
