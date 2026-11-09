import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { enclosingFunction, findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE =
  migrationGuide("effects-lifecycle-and-cleanup");

/**
 * Reports `onCleanup` only where its contract changed in Solid 2: directly
 * inside the callback of a legacy one-argument `createEffect` /
 * `createRenderEffect` / `createComputed`, or of an `onMount`, all imported
 * from Solid. Those scopes become a split effect's apply callback or
 * `onSettled`, which take cleanup as a returned function. In a component
 * body, a custom hook, `createRoot`, or a memo, `onCleanup` is still valid in
 * the RC and is not reported. Calls inside inline ref callbacks are reported
 * by the ref-callback analyzer instead, and a cleanup registered by a helper
 * that an effect calls is not traced.
 */
export function analyzeOnCleanup(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const changedScopes = new Map<string, string>();
  for (const name of ["createEffect", "createRenderEffect", "createComputed", "onMount"]) {
    for (const { call, argumentNodes } of findImportedCalls(rootNode, ["solid-js", "solid-js/web"], name)) {
      const callback = argumentNodes[0];
      if (callback === undefined) continue;
      if (callback.kind() !== "arrow_function" && callback.kind() !== "function_expression") continue;
      if (name !== "onMount" && argumentNodes.length !== 1) continue;
      changedScopes.set(String(callback.id()), name);
    }
  }

  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "onCleanup")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length === 1 &&
        argumentNodes[0]?.kind() !== "spread_element",
    )
    .flatMap(({ call, filename }) => {
      const scope = enclosingFunction(call);
      const owner = scope === null ? undefined : changedScopes.get(String(scope.id()));
      if (owner === undefined) return [];
      const start = call.range().start;
      if (owner === "onMount") {
        return [finding(filename, start, {
        severity: "behavior",
        headline: `Move this onCleanup out of the onMount callback into onSettled's returned cleanup.`,
        why: `Solid ${SOLID_TARGET_VERSION} replaces onMount with onSettled, whose callback takes cleanup as a returned function; onCleanup is rejected inside onSettled (CLEANUP_IN_FORBIDDEN_SCOPE).`,
        guidance: `When this onMount becomes onSettled, return the cleanup function from the onSettled callback instead of registering it with onCleanup; if the callback already returns something, combine both into one returned cleanup.`,
        guide: MIGRATION_GUIDE,
      })];
      }
      return [finding(filename, start, {
        severity: "behavior",
        headline: `Move this onCleanup out of the ${owner} callback into the apply callback's returned cleanup.`,
        why: `Solid ${SOLID_TARGET_VERSION} requires this one-argument ${owner} to split into compute and apply callbacks, and the apply callback takes cleanup as a returned function that runs before the next apply and on disposal.`,
        guidance: `When splitting the effect, move the work this cleanup undoes into the apply callback and return the cleanup function from it, keeping the cleanup's reads in the apply half; drop the onCleanup wrapper.`,
        guide: MIGRATION_GUIDE,
      })];
    });
}
