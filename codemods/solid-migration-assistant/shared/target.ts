/**
 * The single pinned Solid 2 migration destination. Every rule's guidance and
 * report line cites this version and commit; `shared/run-workflow.mjs`
 * repeats the two values for the launcher's disclosure (it cannot import a
 * TypeScript module), and the architecture test proves the copies agree. Bump
 * both with `node tools/bump-target.mjs <version> <commit>`.
 */
export const SOLID_TARGET_VERSION = "2.0.0-rc.23";

export const SOLID_SOURCE_COMMIT =
  "8c34a505a853fcc894fcc8dad150d62f0d007fa2";

export const MIGRATION_GUIDE_URL = `https://github.com/solidjs/solid/blob/${SOLID_SOURCE_COMMIT}/documentation/solid-2.0/MIGRATION.md`;

/** The migration guide URL for one of its section anchors (without `#`). */
export function migrationGuide(anchor?: string): string {
  return anchor === undefined ? MIGRATION_GUIDE_URL : `${MIGRATION_GUIDE_URL}#${anchor}`;
}
