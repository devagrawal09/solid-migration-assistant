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
    .map(({ call, argumentNodes, filename }) => {
      const start = call.range().start;
      const argCount = argumentNodes.length;

      if (argCount === 0) {
        return finding(filename, start, {
        severity: "build",
        headline: `Migrate this zero-argument createEffect call.`,
        why: `Solid 2 requires separate compute and apply callbacks; a zero-argument call is likely a stub or placeholder.`,
        guidance: `Add explicit compute and apply callbacks, or remove the empty call if it is dead code.`,
        guide: MIGRATION_GUIDE,
      });
      }

      if (argCount === 1) {
        const features = complications(argumentNodes[0]!);
        if (features.length === 0) {
          return finding(filename, start, {
        severity: "build",
        headline: `Split this one-argument createEffect into compute and apply callbacks (simple shape).`,
        why: `Solid 2 requires separate compute and apply callbacks. This callback takes no previous value, registers no cleanup, creates no reactive primitives, and is not async, so the split is usually mechanical.`,
        guidance: `Move the reactive reads into the compute callback and return what the side effect needs, then perform the imperative work in the apply callback: createEffect(() => [a(), b()], ([a, b]) => { ... }). Reads left in the apply callback are no longer tracked. createTrackedEffect keeps the one-function shape as an escape hatch, but it may run more than once per change, cannot create primitives, and throws on a pending async read, so prefer the split.`,
        lint: ["no-single-arg-create-effect"],
        guide: MIGRATION_GUIDE,
      });
        }
        return finding(filename, start, {
        severity: "build",
        headline: `Restructure this one-argument createEffect before splitting it.`,
        why: `Solid 2 requires separate compute and apply callbacks, and this callback ${features.join(", ")}, so it cannot be split by moving reads alone.`,
        guidance: `${features.map((feature) => COMPLICATION_GUIDANCE[feature]).join(" ")} Then move the reactive reads into the compute callback and the imperative work into the apply callback.`,
        lint: ["no-single-arg-create-effect"],
        guide: MIGRATION_GUIDE,
      });
      }

      if (argCount === 2) {
        return finding(filename, start, {
        severity: "build",
        headline: `Migrate this two-argument createEffect call.`,
        why: `Solid 2 treats the second argument as options, not an initial value. If this call's second argument is an initial value, it must move to a default parameter of the compute callback. If it is already an apply callback for the split-effect pattern, confirm compatibility with Solid 2 option handling.`,
        guidance: `Read both arguments. If the second argument is a non-function initial value or a function that represents the legacy initialValue parameter, move it to a default parameter on the compute callback: createEffect((prev = INITIAL_VALUE) => compute(prev), applyFn). If the second argument is already the apply function for a manually split effect, verify that no Solid 1.x initialValue semantic is accidentally carried forward and that the call expects the second argument to be options in Solid 2. Stop without proposing a rewrite when the intent of the second argument is unclear, the callback contains cleanup or async work, or the distinction between initialValue and apply callback cannot be resolved from static context. Ask for the smallest focused test or runtime observation that makes the second-argument intent observable.`,
        guide: MIGRATION_GUIDE,
      });
      }

      // argCount >= 3
      return finding(filename, start, {
        severity: "build",
        headline: `Migrate this ${argCount}-argument createEffect call.`,
        why: `Solid 2 treats the second argument as options, not an initial value, and does not support a third positional argument. Legacy three-argument calls (callback, initialValue, options) must be restructured.`,
        guidance: `Move the initial value to a default parameter on the compute callback, and move any legacy options that have Solid 2 equivalents into the second-argument options object. Verify that every legacy option is either mapped to a Solid 2 equivalent or intentionally dropped. Stop without proposing a rewrite when the intent of each argument is unclear. Ask for the smallest focused test or runtime observation that makes the argument roles observable.`,
        guide: MIGRATION_GUIDE,
      });
    });
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
