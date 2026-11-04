import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { lintHint, migrationGuide } from "../../../../shared/target.ts";

const MIGRATION_GUIDE =
  migrationGuide("effects-lifecycle-and-cleanup");

export function analyzeCreateEffect(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "createEffect")
    .filter(
      ({ argumentNodes }) =>
        !argumentNodes.some((a) => a.kind() === "spread_element"),
    )
    .map(({ call, argumentNodes, filename }) => {
      const start = call.range().start;
      const argCount = argumentNodes.length;

      if (argCount === 0) {
        return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this zero-argument createEffect call.
Why: Solid 2 requires separate compute and apply callbacks; a zero-argument call is likely a stub or placeholder.
Guidance: Add explicit compute and apply callbacks, or remove the empty call if it is dead code. Make and validate this migration yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}`;
      }

      if (argCount === 1) {
        return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: split this one-argument createEffect into compute and apply callbacks.
Why: Solid 2 requires separate compute and apply callbacks; the correct split depends on which reads are reactive inputs and which statements are side effects.
Guidance: Read the full callback, imports, and nearby reactive declarations. Identify the reactive reads that should trigger the effect, move those reads into the compute callback, return the value the side effect needs, and perform the imperative operation in the apply callback without adding reactive dependencies. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the effect contains cleanup, async work, nested control flow affecting reads, reactive primitive creation, unrelated operations, writes that may affect its own inputs, or unclear intent. Ask for the smallest focused test or runtime observation that makes the missing behavior decision observable.${lintHint("no-single-arg-create-effect")} Official migration guide: ${MIGRATION_GUIDE}`;
      }

      if (argCount === 2) {
        return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this two-argument createEffect call.
Why: Solid 2 treats the second argument as options, not an initial value. If this call's second argument is an initial value, it must move to a default parameter of the compute callback. If it is already an apply callback for the split-effect pattern, confirm compatibility with Solid 2 option handling.
Guidance: Read both arguments. If the second argument is a non-function initial value or a function that represents the legacy initialValue parameter, move it to a default parameter on the compute callback: createEffect((prev = INITIAL_VALUE) => compute(prev), applyFn). If the second argument is already the apply function for a manually split effect, verify that no Solid 1.x initialValue semantic is accidentally carried forward and that the call expects the second argument to be options in Solid 2. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the intent of the second argument is unclear, the callback contains cleanup or async work, or the distinction between initialValue and apply callback cannot be resolved from static context. Ask for the smallest focused test or runtime observation that makes the second-argument intent observable. Official migration guide: ${MIGRATION_GUIDE}`;
      }

      // argCount >= 3
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this ${argCount}-argument createEffect call.
Why: Solid 2 treats the second argument as options, not an initial value, and does not support a third positional argument. Legacy three-argument calls (callback, initialValue, options) must be restructured.
Guidance: Move the initial value to a default parameter on the compute callback, and move any legacy options that have Solid 2 equivalents into the second-argument options object. Verify that every legacy option is either mapped to a Solid 2 equivalent or intentionally dropped. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the intent of each argument is unclear. Ask for the smallest focused test or runtime observation that makes the argument roles observable. Official migration guide: ${MIGRATION_GUIDE}`;
    });
}
