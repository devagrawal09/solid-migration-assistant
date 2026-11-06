import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE =
  migrationGuide("effects-lifecycle-and-cleanup");

export function analyzeOnCleanup(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "onCleanup")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length === 1 &&
        argumentNodes[0]?.kind() !== "spread_element",
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: review this onCleanup call against Solid 2 ownership.
Why: Solid ${SOLID_TARGET_VERSION} still exports onCleanup for owned scopes such as a component body, createRoot, or the setup half of a directive factory, but the scopes 1.x code most often registered cleanup in have changed: a one-argument createEffect must split into compute and apply callbacks whose cleanup is returned from the apply callback, onMount becomes onSettled whose cleanup is returned, and ref callbacks are now unowned, so onCleanup inside a ref callback no longer runs.
Guidance: Read the cleanup callback and the enclosing scope. Inside a legacy one-argument createEffect or an onMount callback, move the cleanup into the function returned by the split effect's apply callback or by onSettled and drop the onCleanup wrapper. Inside a ref callback, move the work to onSettled in the component body or to the owned setup half of a directive factory. Inside a component body, createRoot, or another owned scope, keep onCleanup as is. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the enclosing scope is unclear or the cleanup has dependencies that would change semantics when lifted into a return. Ask for the smallest focused test or runtime observation that proves the enclosing scope and cleanup timing. Official migration guide: ${MIGRATION_GUIDE}`;
    });
}
