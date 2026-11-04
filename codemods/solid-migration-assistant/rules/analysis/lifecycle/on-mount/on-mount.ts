import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide } from "../../../../shared/target.ts";

const MIGRATION_GUIDE =
  migrationGuide("effects-lifecycle-and-cleanup");

export function analyzeOnMount(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "onMount")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length === 1 &&
        argumentNodes[0]?.kind() !== "spread_element",
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this onMount lifecycle callback.
Why: Solid 2 removes onMount; onSettled is its closest replacement and can return an owner-bound cleanup function, but the correct migration depends on the callback's ownership, required timing, and cleanup behavior.
Guidance: Read the complete callback, its owner, and nearby cleanup registration. Establish who owns the work, when it must run relative to rendering and settling, and what must be disposed. Move the work to onSettled only after proving that timing is compatible, and return owner-bound cleanup from the onSettled callback. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the callback registers cleanup, starts async work, contains nested control flow that changes lifecycle behavior, creates reactive primitives, or has unclear ownership. Ask for the smallest focused test or runtime observation that makes the required timing and cleanup behavior observable. Official migration guide: ${MIGRATION_GUIDE}`;
    });
}
