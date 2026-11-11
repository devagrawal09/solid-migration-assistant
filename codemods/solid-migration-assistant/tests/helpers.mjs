import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/** stdout and stderr of a spawnSync result, for assertion messages. */
export function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

/**
 * A deterministic map of every directory and file (by content hash) under
 * `root`, used to prove that a run left a target byte-identical or produced
 * exactly an expected tree. `node_modules` is skipped so an installed
 * dependency tree never takes part in the comparison.
 */
export function treeSnapshot(root) {
  const snapshot = {};
  visit(root, root, snapshot);
  return snapshot;
}

function visit(root, directory, snapshot) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    if (entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      snapshot[`directory:${relativePath}`] = true;
      visit(root, path, snapshot);
      continue;
    }
    if (!entry.isFile()) continue;
    snapshot[`file:${relativePath}`] = createHash("sha256")
      .update(readFileSync(path))
      .digest("hex");
  }
}

/**
 * Skips a release-tier test whose environment is missing (network, Node
 * version), unless `SOLID_MIGRATION_REQUIRE_RELEASE_TIER=1` is set. CI sets it
 * so a scheduled run can never pass by skipping every check.
 */
export function skipOrFail(t, reason) {
  if (process.env.SOLID_MIGRATION_REQUIRE_RELEASE_TIER === "1") {
    assert.fail(`release tier required but skipped: ${reason}`);
  }
  t.skip(reason);
}
