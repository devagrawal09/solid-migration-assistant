import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rulesDirectory = resolve(packageDirectory, "rules/analysis");
const ruleCases = [
  { directory: "rules/analysis/imports/web-import" },
  { directory: "rules/analysis/imports/beta32-subpaths" },
  { directory: "rules/analysis/imports/jsx-types" },
  {
    directory: "rules/analysis/jsx/component-renames",
    semanticWorkspace: true,
  },
  { directory: "rules/analysis/jsx/class-list" },
  {
    directory: "rules/analysis/lifecycle/on-mount",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/create-effect",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/create-computed",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/create-memo",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/props/merge-props",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/props/split-props",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/store/mutable",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/store/produce",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/store/unwrap",
    semanticWorkspace: true,
  },
  { directory: "rules/analysis/jsx/context-provider" },
  { directory: "rules/analysis/jsx/dom-attr-namespaces" },
  { directory: "rules/analysis/jsx/dom-event-namespaces" },
  { directory: "rules/analysis/jsx/dom-lowercase-events" },
  { directory: "rules/analysis/jsx/ref-callback-scope" },
  { directory: "rules/analysis/jsx/dynamic-component", semanticWorkspace: true },
  { directory: "rules/analysis/reactivity/nested-create-root", semanticWorkspace: true },
  { directory: "rules/analysis/store/setter-calls", semanticWorkspace: true },
  { directory: "rules/analysis/jsx/dom-use-directive" },
  {
    directory: "rules/analysis/reactivity/batch",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/create-resource",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/create-dynamic",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/from-observable",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/error-handling",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/on-helper",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/create-selector",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/index-array",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/transition-apis",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/reactivity/utility-renames",
    semanticWorkspace: true,
  },
  {
    directory: "rules/analysis/lifecycle/on-cleanup",
    semanticWorkspace: true,
  },
];

const configuredAdapters = ruleCases.map(adapterForRule).sort();
const existingAdapters = findFiles(rulesDirectory, (name) =>
  name.endsWith(".test.ts"),
)
  .map((path) => relative(packageDirectory, path))
  .sort();

if (configuredAdapters.length !== 34 || existingAdapters.length !== 34) {
  throw new Error(
    `Expected 34 rule adapters, found ${configuredAdapters.length} configured and ${existingAdapters.length} on disk.`,
  );
}
if (configuredAdapters.join("\n") !== existingAdapters.join("\n")) {
  throw new Error(
    `Rule adapter coverage is out of date.\nConfigured:\n${configuredAdapters.join("\n")}\nOn disk:\n${existingAdapters.join("\n")}`,
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
const existingFixtures = findFiles(rulesDirectory, (name) =>
  name.endsWith(".fixture.tsx"),
)
  .map((path) => relative(packageDirectory, path))
  .sort();

if (configuredFixtures.length !== 56 || existingFixtures.length !== 56) {
  throw new Error(
    `Expected 56 colocated fixture cases, found ${configuredFixtures.length} configured and ${existingFixtures.length} on disk.`,
  );
}
if (configuredFixtures.join("\n") !== existingFixtures.join("\n")) {
  throw new Error(
    `Rule fixture coverage is out of date.\nConfigured:\n${configuredFixtures.join("\n")}\nOn disk:\n${existingFixtures.join("\n")}`,
  );
}

for (const ruleCase of cases) {
  runRuleCase(ruleCase);
}

console.log(
  `Rule detection passed: ${ruleCases.length} adapters, ${cases.length} fixture cases, 0 targets changed.`,
);

function adapterForRule({ directory }) {
  return `${directory}/${basename(directory)}.test.ts`;
}

function directFixtureFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".fixture.tsx"))
    .map((entry) => resolve(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function runRuleCase({ adapter, semanticWorkspace, target }) {
  const adapterPath = resolve(packageDirectory, adapter);
  const fixtureDirectory = dirname(target);
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
  if (semanticWorkspace) {
    args.push("--semantic-workspace", fixtureDirectory);
  }

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
      `Rule detection changed its target.\n${context}\nBefore: ${before}\nAfter:  ${after}`,
    );
  }
  if (result.error) {
    throw new Error(
      `Could not spawn the rule detection command: ${result.error.message}\n${context}`,
      { cause: result.error },
    );
  }
  if (result.signal) {
    throw new Error(
      `Rule detection was terminated by signal ${result.signal}.\n${context}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `Rule detection exited with status ${String(result.status)}.\n${context}`,
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
