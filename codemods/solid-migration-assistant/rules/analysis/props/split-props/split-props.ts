import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE =
  migrationGuide("mergeprops--splitprops--merge--omit");

export function analyzeSplitProps(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "splitProps")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 2 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, argumentNodes, filename }) => {
      const start = call.range().start;
      const keyGroupCount = argumentNodes.length - 1;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this splitProps tuple to reviewed omit-based values.
Why: Solid ${SOLID_TARGET_VERSION} replaces splitProps with omit, but omit returns one object while splitProps returns a tuple containing one selected object per key group plus a final remainder, so migration depends on how those positions are consumed. This call has ${keyGroupCount} key group(s).
Guidance: Trace the complete tuple destructuring or other call-site use, list the exact keys represented by every group, and trace every downstream consumer and reactive property access for each selected value and the remainder. Design explicit omit-based values only after proving how every old tuple member will be produced and that live reactive property access is preserved. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a replacement when keys are dynamic or overlapping, more than one selected group is consumed, the tuple escapes or is indexed dynamically, rest destructuring or reassignment is involved, props or store proxy identity matters, or any consumer is unclear. Ask for the smallest focused test or runtime observation that exposes each consumed tuple member's keys, value, reactive updates, and identity boundary. Official migration guide: ${MIGRATION_GUIDE}`;
    });
}
