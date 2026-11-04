import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup";

export function analyzeCreateMemo(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "createMemo")
    .filter(
      ({ argumentNodes }) =>
        (argumentNodes.length === 2 || argumentNodes.length === 3) &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, argumentNodes, filename }) => {
      const start = call.range().start;
      const legacyOptions =
        argumentNodes.length === 3 ? " and its third argument as options" : "";
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this createMemo initial value.
Why: Solid 1.x treats this call's second argument as its initial value${legacyOptions}, while Solid 2.0.0-rc.21 treats the second argument as options and has no initial-value argument.
Guidance: Read the complete callback, the initial-value expression, its consumers, and nearby reactive state. Establish what the callback must receive on its first run and how later updates use the previous value. Preserve that behavior explicitly in surrounding state or callback logic before removing the legacy initial-value argument. For a three-argument call, review the legacy options separately and move only options supported by Solid 2.0.0-rc.21 into the second-argument position; for a two-argument call, do not reinterpret an option-shaped initial value as options. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when first-run or previous-value behavior is unclear, the initial-value expression has meaningful evaluation timing or side effects, options are dynamic or their compatibility is unknown, the callback writes to its inputs or may form a cycle, or ownership and consumers are unclear. Ask for the smallest focused test or runtime observation that exposes the first computed value and subsequent updates. Official migration guide: ${MIGRATION_GUIDE}`;
    });
}
