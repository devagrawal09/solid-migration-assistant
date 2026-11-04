import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE =
  migrationGuide("produce--now-the-default-setter-behavior");

export function analyzeProduce(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, "solid-js/store", "produce")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length === 1 &&
        argumentNodes[0]?.kind() !== "spread_element",
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this produce wrapper to draft-first setter behavior.
Why: Solid ${SOLID_TARGET_VERSION} store setters are draft-first and receive a mutable draft in their mutation callback, so a legacy produce wrapper is unnecessary only after the surrounding call is proven to use the intended store-setter overload.
Guidance: Read the immediate parent call, identify the exact store setter overload and any path arguments, and review the full mutation callback. Pass the callback directly to the setter only after proving that this wrapper supplies that setter's mutation callback. For nested produce calls, review each wrapper, its containing call, and its full callback independently. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing wrapper removal when the result is stored, returned, composed, passed through another function, used with a non-store setter, or when callback returns, nested control flow, async work, external mutation, or target ownership make draft behavior unclear. Ask for the smallest focused test or runtime observation that exposes the selected setter overload and resulting store update. Official migration guide: ${MIGRATION_GUIDE}`;
    });
}
