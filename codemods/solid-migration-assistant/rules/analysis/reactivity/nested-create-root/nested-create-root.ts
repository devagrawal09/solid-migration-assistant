import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE = migrationGuide("nested-createroot-is-owned-by-its-parent");

const FUNCTION_KINDS = new Set([
  "arrow_function",
  "function_expression",
  "function_declaration",
  "generator_function",
  "generator_function_declaration",
  "method_definition",
]);

/**
 * Reports `createRoot` calls that sit inside a function body, where a parent
 * owner may exist at call time. In Solid 1.x such a root lived until its own
 * `dispose()`; at rc.21 a root created under an existing owner is that
 * owner's child and is disposed with it. Module-level calls have no parent
 * owner and are not reported.
 */
export function analyzeNestedCreateRoot(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "createRoot")
    .filter(({ call }) => call.ancestors().some((ancestor) => FUNCTION_KINDS.has(ancestor.kind())))
    .map(({ call, filename }) => {
      const start = call.range().start;
      return finding(filename, start, {
        severity: "behavior",
        headline: `Decide this nested createRoot's lifetime.`,
        why: `Solid ${SOLID_TARGET_VERSION} parents a root created inside an existing owner to that owner and disposes it with the owner; Solid 1.x kept a nested root alive until its own dispose() was called.`,
        guidance: `Determine whether a parent owner can exist when this call runs. If the root must outlive its creator, wrap the call as runWithOwner(null, () => createRoot(...)) to detach it; if it should be disposed with the creator, keep the call and remove any manual dispose bookkeeping that becomes redundant.`,
        guide: MIGRATION_GUIDE,
      });
    });
}
