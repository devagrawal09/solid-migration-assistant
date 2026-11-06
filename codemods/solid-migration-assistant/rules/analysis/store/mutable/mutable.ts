import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { lintHint, migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE =
  migrationGuide("createmutable--modifymutable--createstore-with-draft-setters");

export function analyzeCreateMutable(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, "solid-js/store", "createMutable")
    .filter(
      ({ argumentNodes }) =>
        (argumentNodes.length === 1 || argumentNodes.length === 2) &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, argumentNodes, filename }) => {
      const start = call.range().start;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this createMutable call to an owned createStore tuple.
Why: Solid ${SOLID_TARGET_VERSION} removes createMutable in favor of createStore, which returns a store-and-setter tuple rather than the directly mutable proxy this call creates. This call has exactly ${argumentNodes.length} semantic argument(s), so its initial value and any second options argument require review before the value and every write can move to that tuple.
Guidance: Trace the created value through every alias, return, call site, and write, identify its owner and every reader and writer, and review a second options argument separately. Introduce createStore only after mapping every property assignment, delete, and mutating array operation to the tuple's explicit setter, including the exact setter path or draft-first setter callback needed to preserve selection and sequencing. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the value escapes, a consumer requires direct mutation or proxy identity, mutation happens through an unknown helper, setter paths cannot be identified, ownership is unclear, or focused tests do not cover the affected reads and writes. Ask for the smallest focused test or runtime observation that exposes the value's reads, writes, identity, and ownership boundary.${lintHint("removed-api")} Official migration guide: ${MIGRATION_GUIDE}`;
    });
}

export function analyzeModifyMutable(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, "solid-js/store", "modifyMutable")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length === 2 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this modifyMutable call to its target store's setter.
Why: Solid ${SOLID_TARGET_VERSION} removes modifyMutable; a createStore tuple's draft-first setter can replace this mutation entry point only after the target is resolved to its store owner, the complete recipe is reviewed, and the exact setter mapping is established.
Guidance: Resolve the first target argument to its exact createMutable owner and planned createStore tuple, inspect the complete second-argument mutation recipe, and map that recipe to the owner's explicit setter while preserving the setter overload, path selection, and update sequencing. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the target origin or setter is unknown, the state or recipe escapes, mutation is delegated to an unknown helper, the callback returns a meaningful value, nested updates or async work are present, or focused tests do not expose the affected reads and writes. Ask for the smallest focused test or runtime observation that exposes the selected target owner, setter path, recipe result, and resulting store update.${lintHint("removed-api")} Official migration guide: ${MIGRATION_GUIDE}`;
    });
}
