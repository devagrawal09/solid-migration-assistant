import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { installCommand, installError, installPlan, parseTscOutput, resolutionProblem, typecheckConfigs } from "../verify/after-migrate.mjs";
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

test("installs a workspace package and its workspace dependencies, not the whole workspace", () => {
  const files = {
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "pnpm-lock.yaml": "",
    "package.json": '{ "name": "root", "private": true }',
    "packages/solid-pacer/package.json": '{ "name": "@tanstack/solid-pacer" }',
    "packages/react-pacer/package.json": '{ "name": "@tanstack/react-pacer" }',
  };
  withTree(files, (root) => {
    const target = join(root, "packages/solid-pacer");
    const plan = installPlan(target, root);
    assert.deepEqual(installCommand(target, plan, ["package.json"]), {
      args: ["install", "--filter", "{packages/solid-pacer}..."],
      command: 'pnpm install --filter "{packages/solid-pacer}..."',
    });
    // From the root, the packages migrate changed.
    assert.deepEqual(installCommand(root, installPlan(root, root), ["packages/solid-pacer/package.json"]).args, ["install", "--filter", "{packages/solid-pacer}..."]);
    assert.match(installCommand(root, installPlan(root, root), ["package.json"]).skipped, /workspace root's package\.json/);
  });
});

test("scopes an npm workspace install with -w, and leaves yarn and bun workspaces to the user", () => {
  const files = { "package-lock.json": "{}", "package.json": '{ "name": "root", "workspaces": ["apps/*"] }', "apps/web/package.json": '{ "name": "web" }' };
  withTree(files, (root) => {
    const target = join(root, "apps/web");
    assert.deepEqual(installCommand(target, installPlan(target, root), []).args, ["install", "-w", "apps/web"]);
    assert.deepEqual(installCommand(target, { directory: root, manager: "yarn" }, []), {
      skipped: "this is a yarn workspace, and a whole-workspace install can be large",
      command: "yarn workspaces focus web",
    });
  });
  withTree({ "package-lock.json": "{}", "package.json": '{ "name": "app" }' }, (root) => {
    assert.deepEqual(installCommand(root, installPlan(root, root), ["package.json"]), { args: ["install"], command: "npm install" });
  });
});

test("distrusts a typecheck when solid-js resolves from above the project or isn't Solid 2", () => {
  const files = {
    "node_modules/solid-js/package.json": '{ "version": "1.9.4" }',
    "project/package.json": "{}",
    "project/node_modules/@solidjs/web/package.json": '{ "version": "2.0.3" }',
  };
  withTree(files, (root) => {
    const target = join(root, "project");
    assert.equal(resolutionProblem(target, target), "solid-js resolves to 1.9.4 at ../node_modules/solid-js, above the project, not the copy this install put in place");
    writeFileSync(join(root, "node_modules/solid-js/package.json"), '{ "version": "2.0.3" }');
    mkdirSync(join(target, "node_modules/solid-js"), { recursive: true });
    writeFileSync(join(target, "node_modules/solid-js/package.json"), '{ "version": "1.9.18" }');
    assert.equal(resolutionProblem(target, target), "solid-js resolves to 1.9.18 at node_modules/solid-js, not Solid 2");
    writeFileSync(join(target, "node_modules/solid-js/package.json"), '{ "version": "2.0.3" }');
    assert.equal(resolutionProblem(target, target), null);
  });
});
