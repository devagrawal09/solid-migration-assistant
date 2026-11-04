#!/usr/bin/env node
/**
 * Moves the pinned Solid 2 target to a new published RC:
 *
 *   node tools/bump-target.mjs <version> <source-commit>
 *
 * The commit must be the `gitHead` npm records for `solid-js@<version>`.
 * The script rewrites the two constants in `shared/target.ts` and
 * `shared/run-workflow.mjs`, then replaces the previous version and commit
 * strings everywhere else they are cited (rule adapters, end-to-end
 * expectations, both READMEs, `codemod.yaml`). It does not re-audit the
 * guidance: after bumping, diff the migration guide between the two commits
 * and re-run `pnpm verify` and `pnpm test:rc-compat`.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [version, commit] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? "") || !/^[0-9a-f]{40}$/.test(commit ?? "")) {
  console.error("usage: node tools/bump-target.mjs <version> <40-hex source commit>");
  process.exit(2);
}

const target = readFileSync(resolve(packageDirectory, "shared/target.ts"), "utf8");
const previousVersion = /SOLID_TARGET_VERSION = "([^"]+)"/.exec(target)?.[1];
const previousCommit = /SOLID_SOURCE_COMMIT =\n\s+"([0-9a-f]{40})"/.exec(target)?.[1];
if (!previousVersion || !previousCommit) {
  console.error("shared/target.ts does not declare the expected constants");
  process.exit(1);
}
if (previousVersion === version && previousCommit === commit) {
  console.log(`already at solid-js@${version} (${commit})`);
  process.exit(0);
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const versionPattern = new RegExp(escape(previousVersion), "g");
const escapedVersionPattern = new RegExp(escape(previousVersion.replace(/\./g, "\\.")), "g");
const commitPattern = new RegExp(previousCommit, "g");
const shortCommitPattern = new RegExp(`\\b${previousCommit.slice(0, 8)}\\b`, "g");

const files = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(?:ts|tsx|mjs|yaml|md|json)$/.test(entry.name)) files.push(path);
  }
};
walk(packageDirectory);
files.push(resolve(packageDirectory, "../../README.md"));

const changed = [];
for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = before
    .replace(commitPattern, commit)
    .replace(shortCommitPattern, commit.slice(0, 8))
    .replace(escapedVersionPattern, version.replace(/\./g, "\\."))
    .replace(versionPattern, version);
  if (after !== before) {
    writeFileSync(file, after);
    changed.push(file.replace(`${packageDirectory}/`, ""));
  }
}
console.log(`solid-js@${previousVersion} (${previousCommit}) -> solid-js@${version} (${commit})`);
console.log(`${changed.length} file(s) updated:\n${changed.map((file) => `  ${file}`).join("\n")}`);
console.log("Next: diff documentation/solid-2.0/MIGRATION.md between the commits, re-audit guidance, run pnpm verify and pnpm test:rc-compat.");
