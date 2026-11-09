import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const GUIDE = MIGRATION_GUIDE_URL;

export function analyzeIndexArray(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "indexArray")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 1 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return finding(filename, start, {
        severity: "build",
        headline: `Migrate this indexArray call to mapArray with keyed: false.`,
        why: `Solid 2 removes indexArray; use mapArray with the keyed: false option for index-keyed list mapping.`,
        guidance: `Replace indexArray(source, mapFn) with mapArray(source, mapFn, { keyed: false }). The mapFn callback receives the same arguments.`,
        lint: ["removed-api"],
        guide: `${GUIDE}#quick-rename--removal-map`,
      });
    });
}
