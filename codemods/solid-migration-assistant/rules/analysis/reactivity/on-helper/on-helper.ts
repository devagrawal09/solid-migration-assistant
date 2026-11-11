import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE =
  migrationGuide("on-helper--split-effects");

export function analyzeOnHelper(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "on")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 1 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return finding(filename, start, {
        severity: "build",
        headline: `Migrate this on tracking wrapper to Solid 2 split effects.`,
        why: `Solid 2 removes the on helper; explicit dependency tracking is unnecessary with split effects.`,
        guidance: `Read the complete dependency list and callback. Separate the callback into compute (reactive reads) and apply (side effects) callbacks, then replace the on() call with createEffect passing both callbacks. Defer each rewrite until every direct createEffect caller is reviewed; verify that the effect fires when intended and that cleanup timing is preserved.`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      });
    });
}
