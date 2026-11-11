import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { directCalleeNames, findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE =
  migrationGuide("effects-lifecycle-and-cleanup");

export function analyzeCreateEffect(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "createEffect")
    .filter(
      ({ argumentNodes }) =>
        !argumentNodes.some((a) => a.kind() === "spread_element"),
    )
    .flatMap<RuleFinding>(({ call, argumentNodes, filename }) => {
      const start = call.range().start;
      const argCount = argumentNodes.length;

      if (argCount === 0) {
        return [finding(filename, start, {
        severity: "build",
        headline: `Migrate this zero-argument createEffect call.`,
        why: `Solid 2 requires separate compute and apply callbacks; a zero-argument call is likely a stub or placeholder.`,
        guidance: `Add explicit compute and apply callbacks, or remove the empty call if it is dead code.`,
        guide: MIGRATION_GUIDE,
      })];
      }

      if (argCount === 1) {
        const features = complications(argumentNodes[0]!);
        if (features.length === 0) {
          return [finding(filename, start, {
        severity: "build",
        headline: `Split this one-argument createEffect into compute and apply callbacks (simple shape).`,
        why: `Solid 2 requires separate compute and apply callbacks. This callback takes no previous value, registers no cleanup, creates no reactive primitives, and is not async, so the split is usually mechanical.`,
        guidance: `Move the reactive reads into the compute callback and return what the side effect needs, then perform the imperative work in the apply callback: createEffect(() => [a(), b()], ([a, b]) => { ... }). Reads left in the apply callback are no longer tracked. createTrackedEffect keeps the one-function shape as an escape hatch, but it may run more than once per change, cannot create primitives, and throws on a pending async read, so prefer the split.`,
        lint: ["no-single-arg-create-effect"],
        guide: MIGRATION_GUIDE,
      })];
        }
        return [finding(filename, start, {
        severity: "build",
        headline: `Restructure this one-argument createEffect before splitting it.`,
        why: `Solid 2 requires separate compute and apply callbacks, and this callback ${features.join(", ")}, so it cannot be split by moving reads alone.`,
        guidance: `${features.map((feature) => COMPLICATION_GUIDANCE[feature]).join(" ")} Then move the reactive reads into the compute callback and the imperative work into the apply callback.`,
        lint: ["no-single-arg-create-effect"],
        guide: MIGRATION_GUIDE,
      })];
      }

      if (argCount === 2) {
        // A second argument that is syntactically a function (arrow or
        // function expression) is already the Solid 2 apply callback; the
        // call is in its 2.0 compute/apply split form, so leave it alone.
        if (isFunctionExpression(argumentNodes[1]!)) return [];
        return [finding(filename, start, {
        severity: "build",
        headline: `Migrate this two-argument createEffect call.`,
        why: `Solid 1 reads the second argument as the initial value, but Solid 2's signature is createEffect(compute, effectFn, options), so the second argument is the apply callback that receives each computed value. A second argument that is syntactically an arrow or function expression is the Solid 2 apply callback and is not reported; this call's second argument is not.`,
        guidance: `If the second argument is a Solid 1 initial value, move it to a default parameter of the compute callback and pass the side effect as the second argument: createEffect((prev = INITIAL_VALUE) => compute(prev), (value) => { ... }). If the second argument is already the apply callback, the call is split and needs no change. Stop and ask when you cannot tell which of the two it is.`,
        guide: MIGRATION_GUIDE,
      })];
      }

      // argCount >= 3
      // A three-argument call whose second argument is a function is already
      // in the Solid 2 compute/apply/options shape; the options object is
      // reviewed there, not here.
      if (argCount === 3 && isFunctionExpression(argumentNodes[1]!)) return [];
      return [finding(filename, start, {
        severity: "build",
        headline: `Migrate this ${argCount}-argument createEffect call.`,
        why: `Solid 1's signature is createEffect(fn, initialValue, options), but Solid 2's is createEffect(compute, effectFn, options): the second argument is the apply callback and options stay third. A second argument that is syntactically an arrow or function expression is the Solid 2 apply callback and is not reported; this call's second argument is not.`,
        guidance: `Move the initial value to a default parameter of the compute callback, pass the side effect as the second argument, and keep the options object third, dropping any option Solid 2 does not support: createEffect((prev = INITIAL_VALUE) => compute(prev), (value) => { ... }, options). If the second argument is already the apply callback, only the options need checking. Stop and ask when you cannot tell the role of each argument.`,
        guide: MIGRATION_GUIDE,
      })];
    });
}

/** Whether a call argument is syntactically an arrow or function expression. */
function isFunctionExpression(node: SgNode<TSX>): boolean {
  const kind = node.kind();
  return kind === "arrow_function" || kind === "function_expression";
}

const PRIMITIVES = new Set([
  "createSignal",
  "createMemo",
  "createEffect",
  "createRenderEffect",
  "createComputed",
  "createResource",
  "createStore",
  "createRoot",
  "createSelector",
  "createDeferred",
  "onMount",
]);

const COMPLICATION_GUIDANCE: Record<string, string> = {
  "is defined elsewhere":
    "Open the referenced callback; the split depends on its body.",
  "reads its previous value":
    "Move the previous value to a default parameter of the compute callback, (prev = initial) => ..., or compare in the apply callback, which receives (value, previousValue).",
  "registers onCleanup":
    "Return the cleanup function from the apply callback instead of calling onCleanup.",
  "creates reactive primitives or nested effects":
    "Hoist the primitives it creates out of the effect into the owning scope; the apply callback is not an owner for new computations.",
  "is async":
    "Make the async work the compute callback's result (an async compute is tracked and pending-aware) and keep the apply callback synchronous.",
};

/** The features of a one-argument effect callback that block a mechanical split. */
function complications(callback: SgNode<TSX>): string[] {
  if (callback.kind() !== "arrow_function" && callback.kind() !== "function_expression") {
    return ["is defined elsewhere"];
  }
  const features: string[] = [];
  const parameters = callback.field("parameters") ?? callback.field("parameter");
  const hasParameter =
    callback.field("parameter") !== null ||
    (parameters !== null && parameters.children().some((child) => child.isNamed() && child.kind() !== "comment"));
  if (hasParameter) features.push("reads its previous value");
  const callees = directCalleeNames(callback);
  if (callees.has("onCleanup")) features.push("registers onCleanup");
  if ([...callees].some((name) => PRIMITIVES.has(name))) {
    features.push("creates reactive primitives or nested effects");
  }
  const isAsync =
    callback.children().some((child) => child.kind() === "async") ||
    callback.findAll({ rule: { kind: "await_expression" } }).length > 0;
  if (isAsync) features.push("is async");
  return features;
}
