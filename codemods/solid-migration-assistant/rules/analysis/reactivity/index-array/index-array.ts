import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";

const GUIDE = "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md";

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
Guidance: Replace indexArray(source, mapFn) with mapArray(source, mapFn, { keyed: false }). The mapFn callback receives the same arguments. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${GUIDE}#quick-rename--removal-map`;
    });
}
