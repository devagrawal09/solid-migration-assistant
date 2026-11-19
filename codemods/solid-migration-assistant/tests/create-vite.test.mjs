import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { output, skipOrFail } from "./helpers.mjs";

/**
 * Opt-in (`pnpm test:create-vite`, part of `pnpm test:release`): the path a
 * new user takes. It scaffolds create-vite's Solid TypeScript template at a
 * pinned create-vite version, runs the workflow in migrate mode the way the
 * registry runs it (install on), and proves the project then builds: the
 * install succeeds, every tsconfig typechecks with 0 errors, and the
 * template's own `npm run build` (tsc -b && vite build) exits 0. It needs
 * network access and Node 22.12 or newer (@solidjs/vite-plugin's engines).
 */
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codemodLauncher = resolve(packageDirectory, "node_modules/codemod/codemod");
const CREATE_VITE = "create-vite@9.3.4";
const MINIMUM_NODE = [22, 12];

test("create-vite's Solid template migrates, installs, typechecks and builds", (t) => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < MINIMUM_NODE[0] || (major === MINIMUM_NODE[0] && minor < MINIMUM_NODE[1])) {
    skipOrFail(t, `@solidjs/vite-plugin requires Node ${MINIMUM_NODE.join(".")} or newer; running ${process.versions.node}`);
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "sma-create-vite-"));
  try {
    const env = { ...process.env, CI: "true", NO_COLOR: "1" };
    const scaffold = spawnSync("npx", ["--yes", CREATE_VITE, "app", "--template", "solid-ts"], { cwd: root, encoding: "utf8", env });
    if (scaffold.status !== 0) {
      skipOrFail(t, `${CREATE_VITE} is unavailable: ${(scaffold.stderr || scaffold.stdout).trim().split("\n").pop()}`);
      return;
    }
    const app = join(root, "app");
    const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
    assert.match(manifest.dependencies["solid-js"], /^\^1\./, "the template should still start on Solid 1");
    assert.ok(manifest.devDependencies["vite-plugin-solid"], "the template should still use vite-plugin-solid");

    const migrate = spawnSync(
      process.execPath,
      [codemodLauncher, "--disable-analytics", "workflow", "run", "-w", packageDirectory, "-t", app, "--allow-dirty", "--no-interactive", "--param", "mode=migrate", "--param", "verify=false"],
      { cwd: packageDirectory, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 },
    );
    assert.equal(migrate.status, 0, output(migrate));
    const report = `${migrate.stdout}\n${migrate.stderr}`;
    assert.match(report, /Replace vite-plugin-solid \S+ with @solidjs\/vite-plugin \^3\.0\.1/);
    assert.match(report, /Installed with `npm install` in the project root\./, output(migrate));
    assert.match(report, /TypeScript \(tsconfig\.app\.json\): 0 errors\./, output(migrate));
    assert.match(report, /TypeScript \(tsconfig\.node\.json\): 0 errors\./, output(migrate));
    assert.doesNotMatch(report, /Still to do/, "the template should need no manual edit");

    const migrated = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
    assert.equal(migrated.dependencies["solid-js"], "^2.0.3");
    assert.equal(migrated.dependencies["@solidjs/web"], "^2.0.3");
    assert.equal(migrated.devDependencies["@solidjs/vite-plugin"], "^3.0.1");
    assert.match(readFileSync(join(app, "vite.config.ts"), "utf8"), /import solid from '@solidjs\/vite-plugin'/);

    const build = spawnSync("npm", ["run", "build"], { cwd: app, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(build.status, 0, output(build));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
