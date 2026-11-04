import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";

const GUIDE = "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md";

export function analyzeCreateSelector(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "createSelector")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 1 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this createSelector call to createProjection or function-form createStore.
Why: Solid 2 replaces createSelector with createProjection(fn, seed) for derived stores with reactive reconciliation.
Guidance: Read the source and optional equality function. Replace with createProjection for derived store projections or function-form createStore(fn) for writable derived stores. Review all consumers of the returned signal to confirm the replacement preserves equality semantics. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${GUIDE}#quick-rename--removal-map`;
    });
}
