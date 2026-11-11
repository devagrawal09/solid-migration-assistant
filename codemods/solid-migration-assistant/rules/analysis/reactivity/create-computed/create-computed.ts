import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE =
  migrationGuide("createcomputed--creatememo-createeffect-or-derived-createsignal");

export function analyzeCreateComputed(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "createComputed")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 1 &&
        argumentNodes.length <= 3 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, argumentNodes, filename }) => {
      const start = call.range().start;
      return finding(filename, start, {
        severity: "build",
        headline: `Choose a Solid 2 replacement for this createComputed call.`,
        why: `Solid ${SOLID_TARGET_VERSION} removes createComputed; the correct replacement depends on whether the callback derives a value, performs an effect, or encodes stateful update logic. This call has ${argumentNodes.length} semantic argument(s).`,
        guidance: `Read the complete callback, its consumers, nearby signal/store declarations, and ordering assumptions. Use createMemo only for a readonly derived value that consumers read. Use Solid 2's split createEffect when reactive reads can be isolated in the compute callback and imperative work belongs in the untracked effect callback. Use function-form createSignal, or derived createStore for object and array projections, only when writable derived state is intentional. Stop without proposing a rewrite when the callback uses its previous value or an initial/options argument, writes to a dependency or may form a cycle, mixes several operations, relies on immediate or render ordering, registers cleanup, starts async work, contains nested control flow or reactive primitive creation, or has unclear ownership or consumers. Ask for the smallest focused test or runtime observation that exposes the required value, timing, and write behavior.`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      });
    });
}
