import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { discoverRules } from "../tools/generate.mjs";

/**
 * tests/guide-coverage.json maps every section of the pinned migration guide
 * to the rules that find it, or says why none does. These specs keep that map
 * honest against the rules; the release suite checks its anchors against the
 * guide itself.
 */
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coverage = JSON.parse(readFileSync(resolve(packageDirectory, "tests/guide-coverage.json"), "utf8"));
const entries = coverage.sections.flatMap((section) => section.points?.map((point) => ({ ...point, anchor: section.anchor })) ?? [section]);
const mappedRules = new Set(entries.flatMap((entry) => entry.rules ?? []));

const sources = [...sourceFiles(join(packageDirectory, "rules")), ...sourceFiles(join(packageDirectory, "shared"))]
  .filter((file) => !file.includes("/fixtures/"))
  .map((file) => readFileSync(file, "utf8"));
const projectRules = new Set(sources.flatMap((source) => [...source.matchAll(/rule: "(project\/[a-z-]+)"/g)].map((match) => match[1])));
const assistantRules = new Set([...discoverRules("analysis"), ...discoverRules("transformations")].map((rule) => rule.id).concat([...projectRules]));

test("every guide section names its rules or says why it has none", () => {
  const unexplained = entries.filter((entry) => !entry.rules?.length && !entry.excluded && !entry.gap);
  assert.deepEqual(unexplained, []);
});

test("an excluded section names no rules", () => {
  assert.deepEqual(entries.filter((entry) => entry.excluded && entry.rules), []);
});

test("every rule the map names exists", () => {
  assert.deepEqual([...mappedRules].filter((rule) => !assistantRules.has(rule)), []);
});

test("every rule appears in the map or says why the guide doesn't cover it", () => {
  const explained = new Set([...mappedRules, ...coverage.beyondGuide.map((entry) => entry.rule)]);
  assert.deepEqual([...assistantRules].filter((rule) => !explained.has(rule)), []);
});

test("every guide link in a rule's guidance points at a mapped section", () => {
  const anchors = new Set(coverage.sections.map((section) => section.anchor));
  const cited = sources.flatMap((source) => [
    ...[...source.matchAll(/migrationGuide\(\s*"([^"]+)"/g)].map((match) => match[1]),
    ...[...source.matchAll(/MIGRATION_GUIDE\}#([a-z0-9-]+)/g)].map((match) => match[1]),
  ]);
  assert.deepEqual(cited.filter((anchor) => !anchors.has(anchor)), []);
});

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|mjs)$/.test(name) ? [path] : [];
  });
}
