import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCodemodArguments, resolveCodemodLauncher } from "../shared/run-workflow.mjs";
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
  const text = runLauncher(["transform", "--allow-dirty", "--target", target]);
  assert.equal(text.status, 0, output(text));
  assert.doesNotMatch(text.stderr, /codemod::runtime|Error:/, "a rule reported a runtime error");
  assert.deepEqual(treeSnapshot(target), treeSnapshot(expectedTree), "the rewritten tree differs from tests/transform-expected");
  compare("transform.txt", normalize(text.stdout, target));

  const second = runLauncher(["transform", "--allow-dirty", "--target", target, "--format", "json"]);
  assert.equal(second.status, 0, output(second));
  assert.deepEqual(treeSnapshot(target), treeSnapshot(expectedTree), "a second transform run changed the target (not idempotent)");
  assert.deepEqual(JSON.parse(second.stdout).rewrites, [], "a second transform run re-reported rewrites (not idempotent)");
  assertNoPersistentArtifacts(target);

  const jsonTarget = fresh("json");
  const json = runLauncher(["transform", "--allow-dirty", "--target", jsonTarget, "--format", "json"]);
  assert.equal(json.status, 0, output(json));
  compare("transform.json", normalize(json.stdout, jsonTarget));

  const directTarget = fresh("direct");
  const direct = spawnSync(
    process.execPath,
    [resolveCodemodLauncher(), ...buildCodemodArguments(directTarget, "transform").filter((argument) => argument !== "--param" && argument !== "format=json")],
    { cwd: packageDirectory, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } },
  );
  assert.equal(direct.status, 0, output(direct));
  assert.deepEqual(treeSnapshot(directTarget), treeSnapshot(expectedTree));
  compare("transform.registry.txt", stepOutput(normalize(`${direct.stdout}\n${direct.stderr}`, directTarget)));
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

if (mismatches.length > 0) {
  console.error(`${mismatches.join("\n\n")}\n\nIf intended, run \`pnpm fixtures:update\` and review the diff.`);
  process.exit(1);
}
console.log(update ? "Updated the transform reports in tests/fixture-expected." : "Transform passed: expected tree, 3 expected reports, idempotent second run.");

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

/** The workflow steps' console output: the lines Codemod indents by two spaces. */
function stepOutput(text) {
  return `${text
    .split("\n")
    .filter((line) => line.startsWith("  "))
    .map((line) => line.slice(2))
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
