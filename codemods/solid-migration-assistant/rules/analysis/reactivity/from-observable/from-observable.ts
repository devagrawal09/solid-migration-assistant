import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { lintHint, MIGRATION_GUIDE_URL, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const GUIDE = MIGRATION_GUIDE_URL;

export function analyzeFrom(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "from")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length === 1 &&
        argumentNodes[0]?.kind() !== "spread_element",
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this from call to the memo-consumed async iterable form.
Why: Solid ${SOLID_TARGET_VERSION} keeps from but changes its contract: instead of returning a signal, from(source) returns an async iterable that a memo consumes, as in createMemo(() => from(source)); the source closes when the memo re-runs or its owner is disposed, a subscribe-function source receives a next value rather than a setter callback, and under SSR the memo's ssrSource option decides how the source is read.
Guidance: Read the source argument and every consumer of the returned signal. Wrap the call as createMemo(() => from(source)) and read the memo where the signal was read, confirm a setter-style producer such as set(prev => ...) is rewritten to compute the value itself, and review SSR behavior for subscriptions or never-ending iterables. Make and validate that edit yourself; this analyzer never edits or runs the target project.${lintHint("removed-api")} Official migration guide: ${GUIDE}#from--observable--from-returns-an-async-iterable--effects`;
    });
}

export function analyzeObservable(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "observable")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length === 1 &&
        argumentNodes[0]?.kind() !== "spread_element",
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this observable call to an effect that pushes to the external subscriber.
Why: Solid ${SOLID_TARGET_VERSION} removes observable (signal-to-observable bridge) with no drop-in replacement; a createEffect that pushes signal changes to the external subscriber replaces it.
Guidance: Read the signal argument and every subscriber to the returned observable. Replace with a split createEffect whose compute callback reads the signal and whose apply callback pushes the value to the subscriber, returning any unsubscribe cleanup. Make and validate that edit yourself; this analyzer never edits or runs the target project.${lintHint("removed-api")} Official migration guide: ${GUIDE}#from--observable--from-returns-an-async-iterable--effects`;
    });
}
