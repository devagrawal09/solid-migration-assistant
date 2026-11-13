// Specs for the guards in workflow.ts, the code-first (codemod/codemod#2485)
// version of the assistant. They need a codemod CLI built from that branch:
// CODEMOD_V2_BIN=/path/to/codemod node --test tests/workflow-v2.test.mjs
// Lint is off (verify=false), so no run touches the network.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const bin = process.env.CODEMOD_V2_BIN;
const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skip = bin ? false : "set CODEMOD_V2_BIN to a codemod CLI built from #2485";

const APP = `import { createContext } from "solid-js";
const Theme = createContext("light");
export const App = () => <Theme.Provider value="dark"><div /></Theme.Provider>;
`;

function project(dependencies, source = APP) {
  const dir = mkdtempSync(join(tmpdir(), "sma-v2-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", dependencies }));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "App.tsx"), source);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture"], { cwd: dir });
  return dir;
}

function run(dir, mode = "analyze") {
  const store = mkdtempSync(join(tmpdir(), "sma-v2-runs-"));
  execFileSync(bin, [
    "workflow", "run", "-w", pkg, "--workflow-name", "v2", "-t", dir,
    "--param", `mode=${mode}`, "--param", "verify=false",
    "--no-interactive", "--disable-analytics",
  ], { env: { ...process.env, CODEMOD_RUN_STORE_DIR: store }, stdio: "pipe" });
  const [id] = readdirSync(store);
  return JSON.parse(readFileSync(join(store, id, "run.json"), "utf8"));
}

const source = (dir) => readFileSync(join(dir, "src", "App.tsx"), "utf8");

test("skips a project that does not depend on solid-js", { skip }, () => {
  const out = run(project({ react: "^19.0.0" })).output;
  assert.equal(out.skipped, "solid-js is not a dependency of this project");
});

test("skips a project already on solid-js 2", { skip }, () => {
  const out = run(project({ "solid-js": "2.0.0-rc.21" })).output;
  assert.equal(out.skipped, "solid-js is already 2.0.0-rc.21");
});

test("skips the router stage when no router, meta or start package is declared", { skip }, () => {
  const out = run(project({ "solid-js": "^1.9.5" })).output;
  assert.deepEqual(out.stages.find((s) => s.name === "Router, meta and start"), {
    name: "Router, meta and start", ran: false, files: 0,
  });
});

test("pauses before rewriting when a dependency has no Solid 2 release", { skip }, () => {
  const dir = project({ "solid-js": "^1.9.5", "@kobalte/core": "^0.13.0" });
  run(dir, "migrate");
  assert.equal(source(dir), APP);
});

test("rewrites source when every dependency has a Solid 2 path", { skip }, () => {
  const dir = project({ "solid-js": "^1.9.5", "@solidjs/router": "^0.15.3" });
  run(dir, "migrate");
  assert.match(source(dir), /<Theme value="dark">/);
});
