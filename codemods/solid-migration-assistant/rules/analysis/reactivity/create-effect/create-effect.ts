import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { directCalleeNames, findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE =
  migrationGuide("effects-lifecycle-and-cleanup");

/**
 * Reports createEffect and createRenderEffect calls by argument count: both
 * take (compute, apply, options) in Solid 2, where Solid 1 took (fn,
 * initialValue, options). A one-argument effect whose body only writes
 * state is reported as a derivation rather than a split.
 */
export function analyzeCreateEffect(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return EFFECTS.flatMap((name) => findImportedCalls(rootNode, ["solid-js", "solid-js/web"], name)
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
        headline: `Migrate this zero-argument ${name} call.`,
        why: `Solid 2 requires separate compute and apply callbacks; a zero-argument call is likely a stub or placeholder.`,
        guidance: `Add explicit compute and apply callbacks, or remove the empty call if it is dead code.`,
        guide: MIGRATION_GUIDE,
      });
      }

      if (argCount === 1) {
        const writes = onlyWrites(argumentNodes[0]!);
        if (writes !== null) {
          return finding(filename, start, {
        severity: "build",
        headline: `Replace this one-argument ${name}, which only writes ${writes} from other state, with a derivation.`,
        why: `Solid 2 requires separate compute and apply callbacks, and an effect that only copies state into ${writes} runs after the values it reads, so readers see the old value until it does. Solid 2 derives state instead: a memo, a writable derived signal, or a projection for a store.`,
        guidance: `Delete the effect and derive the value where ${writes}'s state is created: createMemo(() => ...) for a value, createSignal(() => ...) when it must stay writable, or createProjection(() => ...) for a store (it reconciles the returned value, so reconcile(...) is no longer needed). If the write must stay an effect, split it: ${name}(() => source(), (value) => ${writes}(value)).`,
        lint: ["no-single-arg-create-effect"],
        guide: MIGRATION_GUIDE,
      });
        }
        const features = complications(argumentNodes[0]!);
        if (features.length === 0) {
          return finding(filename, start, {
        severity: "build",
        headline: `Split this one-argument ${name} into compute and apply callbacks (simple shape).`,
        why: `Solid 2 requires separate compute and apply callbacks. This callback takes no previous value, registers no cleanup, creates no reactive primitives, and is not async, so the split is usually mechanical.`,
        guidance: `Move the reactive reads into the compute callback and return what the side effect needs, then perform the imperative work in the apply callback: ${name}(() => [a(), b()], ([a, b]) => { ... }). Reads left in the apply callback are no longer tracked.${name === "createEffect" ? " createTrackedEffect keeps the one-function shape as an escape hatch, but it may run more than once per change, cannot create primitives, and throws on a pending async read, so prefer the split." : ""}`,
        lint: ["no-single-arg-create-effect"],
        guide: MIGRATION_GUIDE,
      });
        }
        return finding(filename, start, {
        severity: "build",
        headline: `Restructure this one-argument ${name} before splitting it.`,
        why: `Solid 2 requires separate compute and apply callbacks, and this callback ${features.join(", ")}, so it cannot be split by moving reads alone.`,
        guidance: `${features.map((feature) => COMPLICATION_GUIDANCE[feature]).join(" ")} Then move the reactive reads into the compute callback and the imperative work into the apply callback.`,
        lint: ["no-single-arg-create-effect"],
        guide: MIGRATION_GUIDE,
      });
      }

      if (argCount === 2) {
        return finding(filename, start, {
        severity: "build",
        headline: `Migrate this two-argument ${name} call.`,
        why: `Solid 1 reads the second argument as the initial value, but Solid 2's signature is ${name}(compute, effectFn, options), so the second argument is the apply callback that receives each computed value.`,
        guidance: `If the second argument is a Solid 1 initial value, move it to a default parameter of the compute callback and pass the side effect as the second argument: ${name}((prev = INITIAL_VALUE) => compute(prev), (value) => { ... }). If the second argument is already the apply callback, the call is split and needs no change. Stop and ask when you cannot tell which of the two it is.`,
        guide: MIGRATION_GUIDE,
      });
      }

      // argCount >= 3
      return finding(filename, start, {
        severity: "build",
        headline: `Migrate this ${argCount}-argument ${name} call.`,
        why: `Solid 1's signature is ${name}(fn, initialValue, options), but Solid 2's is ${name}(compute, effectFn, options): the second argument is the apply callback and options stay third.`,
        guidance: `Move the initial value to a default parameter of the compute callback, pass the side effect as the second argument, and keep the options object third, dropping any option Solid 2 does not support: ${name}((prev = INITIAL_VALUE) => compute(prev), (value) => { ... }, options). If the second argument is already the apply callback, only the options need checking. Stop and ask when you cannot tell the role of each argument.`,
        guide: MIGRATION_GUIDE,
      });
    }));
}

const EFFECTS = ["createEffect", "createRenderEffect"];

/**
 * The setter a one-argument effect callback only calls, when every statement
 * of its body (or its expression body) is a call of the same `setX` name;
 * null otherwise.
 */
function onlyWrites(callback: SgNode<TSX>): string | null {
  if (callback.kind() !== "arrow_function" && callback.kind() !== "function_expression") return null;
  const body = callback.field("body");
  if (body === null) return null;
  const expressions = body.kind() === "statement_block"
    ? body.children().filter((child) => child.isNamed() && child.kind() !== "comment").map((statement) => statement.kind() === "expression_statement" ? statement.child(0) : null)
    : [body];
  const callees = new Set(expressions.map((expression) => expression?.kind() === "call_expression" ? expression.field("function")?.text() : undefined));
  const [only] = callees;
  return callees.size === 1 && expressions.length > 0 && only !== undefined && /^set[A-Z]/.test(only) ? only : null;
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
