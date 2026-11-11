import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE =
  migrationGuide("batch--default-microtask-batching--flush");

export function analyzeBatch(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "batch")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length === 1 &&
        argumentNodes[0]?.kind() !== "spread_element",
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return finding(filename, start, {
        severity: "build",
        headline: `Migrate this batch call to default batching or flush(fn).`,
        why: `Solid ${SOLID_TARGET_VERSION} removes batch. Writes are batched by default and applied in a microtask, and flush(fn) runs fn and then applies its writes synchronously, which is the timing 1.x batch(fn) had; flush is a dev error inside an action body, is not re-entrant inside onSettled or tracked effects, and warns inside effect callbacks, all of which 1.x batch allowed.`,
        guidance: `Read the complete callback, its reactive writes, and what runs right after the call. Replace batch(fn) with flush(fn) where a caller reads the written values synchronously after the call and the call is not inside an action, onSettled, tracked effect, or effect callback; drop the wrapper and keep fn's body where nothing reads synchronously.`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      });
    });
}
