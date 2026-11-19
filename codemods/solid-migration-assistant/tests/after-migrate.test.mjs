import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { installError, installPlan, parseTscOutput, typecheckConfigs } from "../verify/after-migrate.mjs";
import { renderAfterMigrate } from "../shared/format.mjs";

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "sma-after-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function withTree(files, check) {
  const root = tree(files);
  try {
    return check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("installs with the package manager whose lockfile is nearest, up to the repository root", () => {
  withTree({ "pnpm-lock.yaml": "", "packages/app/package.json": "{}" }, (root) => {
    assert.deepEqual(installPlan(join(root, "packages/app"), root), { directory: root, manager: "pnpm" });
  });
});

test("without a lockfile, installs with the packageManager the project declares", () => {
  withTree({ "package.json": '{ "packageManager": "yarn@4.5.0" }' }, (root) => {
    assert.equal(installPlan(root).manager, "yarn");
  });
});

test("typechecks the configs a references-only tsconfig points at", () => {
  const files = {
    "tsconfig.json": '{ // Vite template\n "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }], }',
    "tsconfig.app.json": "{}",
    "tsconfig.node.json": "{}",
  };
  withTree(files, (root) => assert.deepEqual(typecheckConfigs(root, ["tsconfig.json"]), ["tsconfig.app.json", "tsconfig.node.json"]));
});

test("skips a workspace root's catch-all tsconfig when its packages have their own", () => {
  const files = { "tsconfig.json": "{}", "packages/a/tsconfig.json": "{}", "packages/b/tsconfig.json": "{}" };
  withTree(files, (root) =>
    assert.deepEqual(typecheckConfigs(root, Object.keys(files)), ["packages/a/tsconfig.json", "packages/b/tsconfig.json"]),
  );
});

test("reads tsc errors with paths relative to the target", () => {
  const output = "src/App.tsx(3,7): error TS2322: Type 'string' is not assignable to type 'number'.\nFound 1 error.\n";
  assert.deepEqual(parseTscOutput(output, "/repo/packages/app", "/repo").first[0].file, "packages/app/src/App.tsx");
});

test("a failed install says the project wasn't typechecked and shows the install error", () => {
  const text = renderAfterMigrate({ install: { command: "npm install", directory: ".", ok: false, error: "npm error code ERESOLVE" }, typecheck: [] });
  assert.match(text, /`npm install` failed in the project root, so the project wasn't typechecked[\s\S]*ERESOLVE/);
});

test("a failed install keeps the lines that name the conflict and drops npm's log pointers", () => {
  const output = [
    "npm error code ERESOLVE",
    "npm error ERESOLVE could not resolve",
    "npm error",
    "npm error While resolving: app@0.0.0",
    "npm error Found: solid-js@2.0.3",
    "npm error Could not resolve dependency:",
    'npm error peer solid-js@"^1.6.12" from @solid-primitives/i18n@2.2.1',
    "npm error",
    "npm error For a full report see:",
    "npm error /root/.npm/_logs/2026-11-17T15_46_24_122Z-eresolve-report.txt",
  ].join("\n");
  assert.equal(
    installError(output),
    [
      "npm error code ERESOLVE",
      "npm error ERESOLVE could not resolve",
      "npm error While resolving: app@0.0.0",
      "npm error Found: solid-js@2.0.3",
      "npm error Could not resolve dependency:",
      'npm error peer solid-js@"^1.6.12" from @solid-primitives/i18n@2.2.1',
    ].join("\n"),
  );
});

test("an install that only skipped pnpm build scripts shows pnpm's message under the install line", () => {
  const output = '[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.25.11\nRun "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.';
  const text = renderAfterMigrate({ install: { command: "pnpm install", directory: ".", ok: true, warning: installError(output) }, typecheck: [] });
  assert.match(text, /Installed with `pnpm install` in the project root\.\n  \[ERR_PNPM_IGNORED_BUILDS\] Ignored build scripts: esbuild/);
});
