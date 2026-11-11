import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE =
  migrationGuide("effects-lifecycle-and-cleanup");

export function analyzeCreateMemo(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
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
      return finding(filename, start, {
        severity: "behavior",
        headline: `Migrate this createMemo initial value.`,
        why: `Solid 1.x treats this call's second argument as its initial value${legacyOptions}, while Solid ${SOLID_TARGET_VERSION} treats the second argument as options and has no initial-value argument.`,
        guidance: `Read the complete callback, the initial-value expression, its consumers, and nearby reactive state. Establish what the callback must receive on its first run and how later updates use the previous value. Preserve that behavior explicitly in surrounding state or callback logic before removing the legacy initial-value argument. For a three-argument call, review the legacy options separately and move only options supported by Solid ${SOLID_TARGET_VERSION} into the second-argument position; for a two-argument call, do not reinterpret an option-shaped initial value as options. Stop without proposing a rewrite when first-run or previous-value behavior is unclear, the initial-value expression has meaningful evaluation timing or side effects, options are dynamic or their compatibility is unknown, the callback writes to its inputs or may form a cycle, or ownership and consumers are unclear. Ask for the smallest focused test or runtime observation that exposes the first computed value and subsequent updates.`,
        guide: MIGRATION_GUIDE,
      });
    });
}
