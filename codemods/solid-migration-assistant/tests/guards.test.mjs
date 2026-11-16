// Specs for the dependency and file guards in workflow.ts. Lint is off
// (verify=false), so no run touches the network.
import { execFileSync } from "node:child_process";
import { resolveCodemodLauncher } from "../shared/run-workflow.mjs";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const APP = `import { createContext } from "solid-js";
const Theme = createContext("light");
export const App = () => <Theme.Provider value="dark"><div /></Theme.Provider>;
`;

function project(dependencies, { file = "App.tsx", lockfile } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sma-v2-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", dependencies }));
  if (lockfile) writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lockfile));
  mkdirSync(dirname(join(dir, "src", file)), { recursive: true });
  writeFileSync(join(dir, "src", file), APP);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture"], { cwd: dir });
  return dir;
}

function run(dir, mode = "analyze") {
  const store = mkdtempSync(join(tmpdir(), "sma-v2-runs-"));
  execFileSync(process.execPath, [
    resolveCodemodLauncher(), "workflow", "run", "-w", pkg, "-t", dir,
    "--param", `mode=${mode}`, "--param", "verify=false",
    "--no-interactive", "--disable-analytics",
  ], { env: { ...process.env, CODEMOD_RUN_STORE_DIR: store }, stdio: "pipe" });
  const [id] = readdirSync(store);
  return JSON.parse(readFileSync(join(store, id, "run.json"), "utf8"));
}

const source = (dir, file = "App.tsx") => readFileSync(join(dir, "src", file), "utf8");

test("skips a project that does not depend on solid-js", () => {
  const out = run(project({ react: "^19.0.0" })).output;
  assert.equal(out.skipped, "solid-js is not a dependency of this project");
});

test("skips a project already on solid-js 2", () => {
  const out = run(project({ "solid-js": "2.0.0-rc.21" })).output;
  assert.equal(out.skipped, "solid-js is already 2.0.0-rc.21");
});

test("skips the router stage when no router, meta or start package is declared", () => {
  const out = run(project({ "solid-js": "^1.9.5" })).output;
  assert.deepEqual(out.stages.find((s) => s.name === "Router, meta and start"), {
    name: "Router, meta and start", ran: false, files: 0,
  });
});

test("pauses before rewriting when a dependency has no Solid 2 release", () => {
  const dir = project({ "solid-js": "^1.9.5", "@kobalte/core": "^0.13.0" });
  run(dir, "migrate");
  assert.equal(source(dir), APP);
});

test("rewrites source when every dependency has a Solid 2 path", () => {
  const dir = project({ "solid-js": "^1.9.5", "@solidjs/router": "^0.15.3" });
  run(dir, "migrate");
  assert.match(source(dir), /<Theme value="dark">/);
});

test("rewrites a route file whose name has brackets", () => {
  const dir = project({ "solid-js": "^1.9.5" }, { file: "routes/[id].tsx" });
  run(dir, "migrate");
  assert.match(source(dir, "routes/[id].tsx"), /<Theme value="dark">/);
});

test("reads a lockfile that has linked packages", () => {
  const lockfile = { packages: {
    "node_modules/solid-js": { version: "1.9.5" },
    "node_modules/local-editor": { resolved: "../editor", link: true },
  } };
  const out = run(project({ "solid-js": "^1.9.5" }, { lockfile })).output;
  assert.deepEqual(out.failures, []);
});

test("does not lint when verify is false", () => {
  const out = run(project({ "solid-js": "^1.9.5" })).output;
  assert.equal(out.lint, "skipped");
});
