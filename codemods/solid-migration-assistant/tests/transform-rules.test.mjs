import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const transformationsDirectory = resolve(packageDirectory, "rules/transformations");
const EXPECTED_ADAPTER_COUNT = 6;
const EXPECTED_FIXTURE_COUNT = 58;
const ruleCases = [
  { directory: "rules/transformations/imports/legacy-subpath-relocation" },
  { directory: "rules/transformations/imports/web-package-relocation" },
  { directory: "rules/transformations/jsx/class-list-to-class" },
  { directory: "rules/transformations/jsx/context-provider-to-context" },
  { directory: "rules/transformations/jsx/index-to-for" },
  { directory: "rules/transformations/jsx/lowercase-event-handlers" },
];

const configuredAdapters = ruleCases.map(adapterForRule).sort();
const existingAdapters = findFiles(transformationsDirectory, (name) =>
  name.endsWith(".test.ts"),
)
  .map((path) => relative(packageDirectory, path))
  .sort();

if (
  configuredAdapters.length !== EXPECTED_ADAPTER_COUNT ||
  existingAdapters.length !== EXPECTED_ADAPTER_COUNT
) {
  throw new Error(
    `Expected ${EXPECTED_ADAPTER_COUNT} transform rule adapters, found ${configuredAdapters.length} configured and ${existingAdapters.length} on disk.`,
  );
}
if (configuredAdapters.join("\n") !== existingAdapters.join("\n")) {
  throw new Error(
    `Transform rule adapter coverage is out of date.\nConfigured:\n${configuredAdapters.join("\n")}\nOn disk:\n${existingAdapters.join("\n")}`,
  );
}

const cases = ruleCases.flatMap((ruleCase) => {
  const ruleDirectory = resolve(packageDirectory, ruleCase.directory);
  const adapter = adapterForRule(ruleCase);
  return directFixtureFiles(ruleDirectory).map((target) => ({
    ...ruleCase,
    adapter,
    target,
  }));
});

const configuredFixtures = cases
  .map(({ target }) => relative(packageDirectory, target))
  .sort();
const existingFixtures = findFiles(transformationsDirectory, (name) =>
  name.endsWith(".fixture.tsx"),
)
  .map((path) => relative(packageDirectory, path))
  .sort();

if (
  configuredFixtures.length !== EXPECTED_FIXTURE_COUNT ||
  existingFixtures.length !== EXPECTED_FIXTURE_COUNT
) {
  throw new Error(
    `Expected ${EXPECTED_FIXTURE_COUNT} colocated transform rule fixtures, found ${configuredFixtures.length} configured and ${existingFixtures.length} on disk.`,
  );
}
if (configuredFixtures.join("\n") !== existingFixtures.join("\n")) {
  throw new Error(
    `Transform rule fixture coverage is out of date.\nConfigured:\n${configuredFixtures.join("\n")}\nOn disk:\n${existingFixtures.join("\n")}`,
  );
}

for (const ruleCase of cases) {
  runRuleCase(ruleCase);
}

console.log(
  `Transform rule detection passed: ${ruleCases.length} adapters, ${cases.length} fixture cases, 0 targets changed.`,
);

function adapterForRule({ directory }) {
  return `${directory}/${basename(directory)}.test.ts`;
}

function directFixtureFiles(directory) {
  const fixturesDirectory = resolve(directory, "fixtures");
  return readdirSync(fixturesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".fixture.tsx"))
    .map((entry) => resolve(fixturesDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function runRuleCase({ adapter, target }) {
  const adapterPath = resolve(packageDirectory, adapter);
  const args = [
    "dlx",
    "codemod@1.12.13",
    "jssg",
    "run",
    "--language",
    "tsx",
    adapterPath,
    "--target",
    target,
    "--dry-run",
    "--no-interactive",
    "--allow-dirty",
    "--disable-analytics",
    "--no-color",
  ];

  const before = hashFile(target);
  const result = spawnSync("pnpm", args, {
    cwd: packageDirectory,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  });
  const after = hashFile(target);
  const context = commandContext(adapterPath, target, result);

  if (before !== after) {
    throw new Error(
      `Transform rule detection changed its target.\n${context}\nBefore: ${before}\nAfter:  ${after}`,
    );
  }
  if (result.error) {
    throw new Error(
      `Could not spawn the transform rule command: ${result.error.message}\n${context}`,
      { cause: result.error },
    );
  }
  if (result.signal) {
    throw new Error(
      `Transform rule detection was terminated by signal ${result.signal}.\n${context}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `Transform rule detection exited with status ${String(result.status)}.\n${context}`,
    );
  }
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function commandContext(adapter, target, result) {
  return [
    `Adapter: ${relative(packageDirectory, adapter)}`,
    `Fixture: ${relative(packageDirectory, target)}`,
    `stdout:\n${result.stdout || "(empty)"}`,
    `stderr:\n${result.stderr || "(empty)"}`,
  ].join("\n");
}

function findFiles(directory, predicate) {
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) matches.push(...findFiles(path, predicate));
    if (entry.isFile() && predicate(entry.name)) matches.push(path);
  }
  return matches;
}
