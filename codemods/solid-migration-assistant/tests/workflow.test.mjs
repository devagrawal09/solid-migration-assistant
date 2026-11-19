import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DISCLOSURE, resolveCodemodLauncher } from "../shared/run-workflow.mjs";
import { output, treeSnapshot } from "./helpers.mjs";

/**
 * Exercises the read-only analyze workflow end to end, against committed
 * expected output in `tests/fixture-expected/`:
 *
 * - `analyze.txt`, `analyze.json`, `analyze.agent.md`: the launcher's three
 *   formats for the checked-in fixture (which includes a cross-file reference
 *   that only workspace-semantic analysis can resolve), with the temporary
 *   target path written as `<target>`;
 * - `registry.txt`: the workflow's own text report when Codemod runs it
 *   directly, as registry users do, with the package.json and tsconfig
 *   findings it shares with the launcher (`shared/project.mjs`) but none of
 *   the launcher's npm lookups.
 *
 * It also proves byte-identical output across two runs, a clean run on a
 * project with no supported sites, that a direct run says why it skipped a
 * project, a relative --target, and that no run writes into the target or
 * leaves analyzer artifacts there.
 * `pnpm fixtures:update` rewrites the expected files; review the diff.
 */
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = resolve(packageDirectory, "tests/fixture");
const emptyDirectory = resolve(packageDirectory, "tests/empty");
const expectedDirectory = resolve(packageDirectory, "tests/fixture-expected");
const analyzerLauncher = resolve(packageDirectory, "bin/solid-migration-assistant.mjs");
const update = process.argv.includes("--update");

const temporaryRoot = mkdtempSync(join(tmpdir(), "solid-migration-assistant-workflow-"));
const mismatches = [];
try {
  const target = join(temporaryRoot, "fixture");
  cpSync(fixtureDirectory, target, { recursive: true });
  const before = treeSnapshot(target);
  const normalize = (text) => stripAnsi(text).replaceAll(target, "<target>");

  const first = runAnalyzer(["--target", target]);
  assert.equal(first.status, 0, output(first));
  compare("analyze.txt", normalize(first.stdout));
  assertFinalDisclosure(first.stderr);
  assertDetectionOnlyTerminalOutput(first.stdout + first.stderr);
  assert.doesNotMatch(first.stderr, /codemod::runtime|Error:/, "a rule reported a runtime error");
  assert.deepEqual(treeSnapshot(target), before, "the first run changed the target");
  assertNoPersistentArtifacts(target);

  const second = runAnalyzer(["--target", target]);
  assert.equal(second.status, 0, output(second));
  assert.equal(stripAnsi(second.stdout), stripAnsi(first.stdout), "guidance changed between two runs on the same target");
  assert.deepEqual(treeSnapshot(target), before, "the second run changed the target");

  // --format json and --format agent carry the same findings and are just as read-only.
  const json = runAnalyzer(["--target", target, "--format", "json"]);
  assert.equal(json.status, 0, output(json));
  const report = JSON.parse(json.stdout);
  assert.equal(report.status, 0);
  compare("analyze.json", normalize(json.stdout));
  const agent = runAnalyzer(["--target", target, "--format", "agent"]);
  assert.equal(agent.status, 0, output(agent));
  compare("analyze.agent.md", normalize(agent.stdout));
  assert.equal((agent.stdout.match(/^- \[ \] /gm) ?? []).length, report.summary.findings);
  assert.deepEqual(treeSnapshot(target), before, "the JSON and agent runs changed the target");

  // Run directly through Codemod, as a registry user would, the workflow
  // prints its own text report: the same source findings, no project ones.
  const direct = runDirect(target);
  assert.equal(direct.status, 0, output(direct));
  compare("registry.txt", stepOutput(normalize(`${direct.stdout}\n${direct.stderr}`)));
  assert.deepEqual(treeSnapshot(target), before, "the direct run changed the target");

  // A relative --target resolves against the invocation directory.
  const relative = runAnalyzer(["--target", "fixture"], temporaryRoot);
  assert.equal(relative.status, 0, output(relative));
  assert.equal(normalize(relative.stdout), normalize(first.stdout));

  // A project with no supported migration sites prints only the empty notice.
  const empty = join(temporaryRoot, "empty");
  cpSync(emptyDirectory, empty, { recursive: true });
  const emptyBefore = treeSnapshot(empty);
  const emptyRun = runAnalyzer(["--target", empty]);
  assert.equal(emptyRun.status, 0, output(emptyRun));
  assert.equal(
    stripAnsi(emptyRun.stdout),
    "[solid-migration-assistant] No supported migration sites found. This is not proof that the project is ready for Solid 2; run its own type, build, and test checks.\n",
  );
  assertFinalDisclosure(emptyRun.stderr);
  assert.deepEqual(treeSnapshot(empty), emptyBefore, "the empty run changed the target");
  assertNoPersistentArtifacts(empty);

  // Run directly, a project the workflow skips says why, instead of
  // finishing with no output.
  const notSolid = runDirect(empty);
  assert.equal(notSolid.status, 0, output(notSolid));
  assert.equal(
    stepOutput(stripAnsi(`${notSolid.stdout}\n${notSolid.stderr}`)),
    "[solid-migration-assistant] Nothing to analyze: solid-js is not a dependency of this project. This workflow moves Solid 1.9 projects to Solid 2.0.3, and everything it detects or rewrites is Solid 1 code, so it scanned no source files. This is not proof that the project is ready for Solid 2; run its own type, build, and test checks.\n",
  );
  const migrated = join(temporaryRoot, "migrated");
  cpSync(emptyDirectory, migrated, { recursive: true });
  writeFileSync(join(migrated, "package.json"), JSON.stringify({ dependencies: { "solid-js": "^2.0.3", "@solidjs/web": "^2.0.3" } }));
  const onSolid2 = runDirect(migrated);
  assert.equal(onSolid2.status, 0, output(onSolid2));
  assert.match(stripAnsi(`${onSolid2.stdout}\n${onSolid2.stderr}`), /^\[solid-migration-assistant\] Nothing to analyze: solid-js is already \^2\.0\.3\. /m);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

if (mismatches.length > 0) {
  console.error(`${mismatches.join("\n\n")}\n\nIf intended, run \`pnpm fixtures:update\` and review the diff.`);
  process.exit(1);
}
console.log(update ? "Updated tests/fixture-expected." : "Workflow output passed: 4 expected outputs, 2 targets unchanged.");

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

/** The workflow's console output: everything but Codemod's run and step progress lines. */
function stepOutput(text) {
  return `${text
    .split("\n")
    .filter((line) => !/^(?:[▸✓◐✗] |Run [0-9a-f-]{36}$|Done\b)/.test(line))
    .join("\n")
    .trim()}\n`;
}

function runDirect(target) {
  return spawnSync(
    process.execPath,
    [resolveCodemodLauncher(), "--disable-analytics", "workflow", "run", "-w", packageDirectory, "-t", target, "--allow-dirty", "--no-interactive", "--param", "verify=false"],
    { cwd: packageDirectory, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } },
  );
}

function runAnalyzer(argumentsList, cwd = packageDirectory) {
  return spawnSync(process.execPath, [analyzerLauncher, ...argumentsList], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "true", NO_COLOR: "1", FORCE_COLOR: undefined },
    maxBuffer: 64 * 1024 * 1024,
  });
}

function assertFinalDisclosure(value) {
  const stripped = stripAnsi(value).trimEnd();
  assert.ok(stripped.endsWith(DISCLOSURE));
  assert.equal(stripped.split("[solid-migration-assistant] Final disclosure").length - 1, 1);
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function assertDetectionOnlyTerminalOutput(value) {
  assert.doesNotMatch(stripAnsi(value), /codemod-reports|migration report|safe-transform|agent-guided|confidence/i);
}

function assertNoPersistentArtifacts(target) {
  for (const path of [".codemod", ".codemod-reports", "build", "coverage", "dist"]) {
    assert.equal(existsSync(join(target, path)), false, path);
  }
}
