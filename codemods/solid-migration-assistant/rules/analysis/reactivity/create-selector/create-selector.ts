import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const GUIDE = MIGRATION_GUIDE_URL;

export function analyzeCreateSelector(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "createSelector")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 1 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return finding(filename, start, {
        severity: "build",
        headline: `Migrate this createSelector call to createProjection or function-form createStore.`,
        why: `Solid 2 replaces createSelector with createProjection(fn, seed) for derived stores with reactive reconciliation.`,
        guidance: `Read the source and optional equality function. Replace with createProjection for derived store projections or function-form createStore(fn) for writable derived stores. Review all consumers of the returned signal to confirm the replacement preserves equality semantics.`,
        lint: ["removed-api"],
        guide: `${GUIDE}#quick-rename--removal-map`,
      });
    });
}
