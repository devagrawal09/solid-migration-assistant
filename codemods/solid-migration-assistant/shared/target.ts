/**
 * The single pinned Solid 2 migration destination. Every rule's guidance and
 * report line cites this version and commit; `shared/run-workflow.mjs`
 * repeats the two values for the launcher's disclosure (it cannot import a
 * TypeScript module), and the architecture test proves the copies agree. Bump
 * both with `node tools/bump-target.mjs <version> <commit>`.
 */
export const SOLID_TARGET_VERSION = "2.0.0-rc.21";

export const SOLID_SOURCE_COMMIT =
  "2105ffb8ca2fced55f5fac0763177fc93f97c2c2";

export const MIGRATION_GUIDE_URL = `https://github.com/solidjs/solid/blob/${SOLID_SOURCE_COMMIT}/documentation/solid-2.0/MIGRATION.md`;

/** The migration guide URL for one of its section anchors (without `#`). */
export function migrationGuide(anchor?: string): string {
  return anchor === undefined ? MIGRATION_GUIDE_URL : `${MIGRATION_GUIDE_URL}#${anchor}`;
}

/**
 * A pointer to the eslint-plugin-solid rule (its `v2` config) that keeps
 * reporting a manual-review site after the migration, so the one-shot
 * guidance and the continuous lint read as one pipeline. Only rules whose
 * detection was checked against the plugin's `main` are named.
 */
export function lintHint(...rules: string[]): string {
  const names = rules.map((rule) => `solid/${rule}`);
  const list =
    names.length === 1 ? `${names[0]} rule` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} rules`;
  return ` Ongoing check: after migration, eslint-plugin-solid's ${list} (v2 config) reports this site.`;
}
