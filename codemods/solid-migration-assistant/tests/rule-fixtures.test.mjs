import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverRules } from "../tools/generate.mjs";

/**
 * Every rule against its colocated fixtures, compared with committed
 * expected files. Each fixture `rules/<kind>/<domain>/<rule>/fixtures/
 * <name>.fixture.tsx` has a `<name>.expected.json` next to it holding the
 * analyzer's findings or the transform's rewrites, and a transform fixture
 * the rule changes also has `<name>.expected.tsx`, the exact rewritten text.
 *
 * All fixtures run in one `codemod jssg run` of `tests/fixture-runner.ts`
 * over `rules/` with a workspace semantic provider, so cross-file fixtures
 * resolve each other. The run must leave every fixture byte-identical, and
 * every transform's output must be settled: a second pass of the rule over
 * its own output must find nothing left to rewrite.
 *
 * `pnpm test:rules --update` (alias `pnpm fixtures:update`) rewrites the
 * expected files from the current rules; review the diff before committing.
 */
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rulesDirectory = join(packageDirectory, "rules");
const codemod = join(packageDirectory, "node_modules/codemod/codemod");
const update = process.argv.includes("--update");

const fixtures = [];
for (const kind of ["analysis", "transformations"]) {
  for (const rule of discoverRules(kind)) {
    const directory = join(packageDirectory, dirname(rule.source), "fixtures");
    const names = existsSync(directory)
      ? readdirSync(directory).filter((name) => name.endsWith(".fixture.tsx")).sort()
      : [];
    if (names.length === 0) fail(`${relative(packageDirectory, directory)} must hold at least one *.fixture.tsx`);
    for (const name of names) {
      fixtures.push({ kind, rule: rule.id, path: join(directory, name) });
    }
    for (const name of existsSync(directory) ? readdirSync(directory) : []) {
      const base = name.replace(/\.(?:fixture\.tsx|expected\.json|expected\.tsx)$/, "");
      if (base === name) fail(`unexpected file ${relative(packageDirectory, join(directory, name))}`);
      if (!names.includes(`${base}.fixture.tsx`) && !update) {
        fail(`${relative(packageDirectory, join(directory, name))} has no fixture`);
      }
    }
  }
}

const before = new Map(fixtures.map(({ path }) => [path, hash(path)]));
const result = spawnSync(
  codemod,
  [
    "--disable-analytics",
    "jssg",
    "run",
    "--language",
    "tsx",
    join(packageDirectory, "tests/fixture-runner.ts"),
    "--target",
    rulesDirectory,
    "--semantic-workspace",
    rulesDirectory,
    "--dry-run",
    "--no-interactive",
    "--allow-dirty",
    "--no-color",
  ],
  { cwd: packageDirectory, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const transcript = `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
if (result.error) fail(`could not run the fixture runner: ${result.error.message}`);
if (result.status !== 0) fail(`the fixture runner exited with ${result.status}\n${transcript}`);
if (/codemod::runtime|Error:/.test(`${result.stdout}\n${result.stderr}`)) {
  fail(`the fixture runner reported an error\n${transcript}`);
}
for (const [path, digest] of before) {
  if (hash(path) !== digest) fail(`the fixture runner changed ${relative(packageDirectory, path)}`);
}

const results = new Map();
for (const line of result.stdout.split("\n")) {
  const marker = line.indexOf("SMA-FIXTURE ");
  if (marker === -1) continue;
  const entry = JSON.parse(line.slice(marker + "SMA-FIXTURE ".length));
  const path = join(rulesDirectory, entry.fixture);
  if (results.has(path)) fail(`${entry.fixture} was reported twice`);
  results.set(path, entry);
}

const failures = [];
const updated = [];
for (const fixture of fixtures) {
  const entry = results.get(fixture.path);
  const label = relative(packageDirectory, fixture.path);
  if (entry === undefined) {
    failures.push(`${label}: the runner reported nothing`);
    continue;
  }
  const jsonPath = fixture.path.replace(/\.fixture\.tsx$/, ".expected.json");
  const outputPath = fixture.path.replace(/\.fixture\.tsx$/, ".expected.tsx");
  const json = `${JSON.stringify(
    fixture.kind === "analysis" ? { findings: entry.findings } : { rewrites: entry.rewrites },
    null,
    2,
  )}\n`;
  const output = fixture.kind === "analysis" ? null : entry.output;

  if (fixture.kind === "transformations" && entry.unsettled.length > 0) {
    failures.push(
      `${label}: a second pass over the output would still rewrite:\n${JSON.stringify(entry.unsettled, null, 2)}`,
    );
  }

  if (update) {
    if (writeIfChanged(jsonPath, json)) updated.push(jsonPath);
    if (output === null) {
      if (existsSync(outputPath)) {
        rmSync(outputPath);
        updated.push(outputPath);
      }
    } else if (writeIfChanged(outputPath, output)) {
      updated.push(outputPath);
    }
    continue;
  }

  const expectedJson = existsSync(jsonPath) ? readFileSync(jsonPath, "utf8") : null;
  if (expectedJson !== json) {
    failures.push(
      `${label}: ${expectedJson === null ? "no expected file" : "output differs from"} ${relative(packageDirectory, jsonPath)}\n${firstDifference(expectedJson ?? "", json)}`,
    );
  }
  const expectedOutput = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : null;
  if (expectedOutput !== output) {
    failures.push(
      output === null
        ? `${label}: the rule leaves this fixture unchanged, but ${relative(packageDirectory, outputPath)} exists`
        : `${label}: rewritten text differs from ${relative(packageDirectory, outputPath)}\n${firstDifference(expectedOutput ?? "", output)}`,
    );
  }
}

if (failures.length > 0) {
  fail(`${failures.length} fixture mismatch(es); if intended, run \`pnpm fixtures:update\` and review the diff.\n\n${failures.join("\n\n")}`);
}
const counts = (kind) => fixtures.filter((fixture) => fixture.kind === kind).length;
console.log(
  update
    ? `Updated ${updated.length} expected file(s).${updated.map((path) => `\n  ${relative(packageDirectory, path)}`).join("")}`
    : `Rule fixtures passed: ${counts("analysis")} analysis and ${counts("transformations")} transform fixtures, 0 targets changed.`,
);

function writeIfChanged(path, contents) {
  if (existsSync(path) && readFileSync(path, "utf8") === contents) return false;
  writeFileSync(path, contents);
  return true;
}

function firstDifference(expected, actual) {
  const left = expected.split("\n");
  const right = actual.split("\n");
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) {
      return `  line ${index + 1}\n  expected: ${left[index] ?? "(end of file)"}\n  actual:   ${right[index] ?? "(end of file)"}`;
    }
  }
  return "  (no line differs)";
}

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
