import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { lintHint, MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";

const GUIDE = MIGRATION_GUIDE_URL;

export function analyzeIndexArray(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "indexArray")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 1 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this indexArray call to mapArray with keyed: false.
Why: Solid 2 removes indexArray; use mapArray with the keyed: false option for index-keyed list mapping.
Guidance: Replace indexArray(source, mapFn) with mapArray(source, mapFn, { keyed: false }). The mapFn callback receives the same arguments. Make and validate that edit yourself; this analyzer never edits or runs the target project.${lintHint("removed-api")} Official migration guide: ${GUIDE}#quick-rename--removal-map`;
    });
}
