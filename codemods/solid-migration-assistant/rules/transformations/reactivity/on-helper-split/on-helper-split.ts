import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { directCalleeNames, enclosingFunction } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import { importedConstDeclaration } from "../../../../shared/provenance.ts";
import { identifierReferences, provenImport, removeImportedSpecifier } from "../../../../shared/imports.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";
import { rewrite, type RuleRewrite } from "../../../../shared/finding.ts";

export const ON_HELPER_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#on-helper--split-effects`;

const CORE_MODULE = "solid-js";

/** Calls that need an owner or create reactive nodes, which the apply phase does not provide. */
const OWNER_DEPENDENT = new Set([
  "onCleanup",
  "onMount",
  "useContext",
  "getOwner",
  "runWithOwner",
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
]);

export type OnHelperRewrite = {
  edit: Edit;
  report: RuleRewrite;
};

/**
 * The automatic subset of the Solid 2 `on` helper removal.
 *
 * Solid 1.9.13's `on(deps, fn)` (`packages/solid/src/reactive/signal.ts`)
 * returns an effect function that reads `deps()` tracked and then calls
 * `fn(input, prevInput, prevValue)` untracked, returning fn's result as the
 * effect's next value. Solid 2.0.0-rc.21 removes `on` because
 * `createEffect(compute, apply)` (`packages/signals/src/signals.ts`) already
 * separates the tracked read from the untracked side effect: the compute
 * result is passed to `apply(value, previousValue)`. So
 *
 *   createEffect(on(count, (value, prev) => { log(value, prev); }))
 *   ->  createEffect(() => count(), (value, prev) => { log(value, prev); })
 *
 * keeps the dependency, the arguments fn receives, and its untracked
 * execution. The rewrite is applied only when all of the following hold:
 *
 * - `createEffect` and `on` are each the file's single named import of that
 *   name from `solid-js` (aliases are fine) and are bound nowhere else;
 * - the call is `createEffect(on(dep, fn))` with exactly those arguments: no
 *   effect initial value, no `on` options such as `defer`, and no comments;
 * - `dep` is a zero-parameter arrow function, or an identifier the file binds
 *   exactly once as the getter of `createSignal(...)` (first element of the
 *   tuple) or as `const x = createMemo(...)`, or imports from another
 *   project file whose own `const x = createMemo(...)` is proven there
 *   (`shared/provenance.ts`; a destructured signal export cannot be
 *   resolved and is refused); an identifier is wrapped as
 *   `() => x()` so the compute callback never passes its previous value into
 *   `x`, and arrays of dependencies are refused;
 * - `fn` is an inline arrow or function expression with at most two
 *   parameters (fn's third argument, the previous return value, has no Solid
 *   2 equivalent), no rest parameter, and a block body that returns no value,
 *   because a value returned from the apply callback is treated as cleanup;
 * - `fn` is not async or a generator, and calls none of `onCleanup`,
 *   `onMount`, `useContext`, `getOwner`, `runWithOwner`, or a reactive
 *   primitive, which relied on the effect's owner in 1.x.
 *
 * When every remaining reference to the `on` import has been rewritten, the
 * import specifier (or a statement holding only it) is removed. Everything
 * else stays with the analyzer.
 */
export function rewriteOnHelper(rootNode: SgNode<TSX>, filename: string): OnHelperRewrite[] {
  const effect = provenImport(rootNode, CORE_MODULE, "createEffect");
  const on = provenImport(rootNode, CORE_MODULE, "on");
  if (effect === null || on === null) return [];

  const rewrites: { node: SgNode<TSX>; entry: OnHelperRewrite }[] = [];
  const rewrittenOnCallees = new Set<number>();

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    const callee = call.field("function");
    if (callee === null || callee.kind() !== "identifier" || callee.text() !== effect.local) continue;
    const effectArgs = argumentList(call);
    if (effectArgs === null || effectArgs.length !== 1) continue;
    const inner = effectArgs[0]!;
    if (inner.kind() !== "call_expression") continue;
    const innerCallee = inner.field("function");
    if (innerCallee === null || innerCallee.kind() !== "identifier" || innerCallee.text() !== on.local) continue;
    const onArgs = argumentList(inner);
    if (onArgs === null || onArgs.length !== 2) continue;
    const [dep, fn] = onArgs as [SgNode<TSX>, SgNode<TSX>];
    const compute = computeFor(dep, rootNode, getterFactories(rootNode));
    if (compute === null || !splittableCallback(fn)) continue;

    rewrittenOnCallees.add(innerCallee.id());
    const start = call.range().start;
    rewrites.push({
      node: call,
      entry: {
        edit: call.field("arguments")!.replace(`(${compute}, ${fn.text()})`),
        report: rewrite(filename, start, `Rewrite createEffect(on(dep, fn)) as createEffect(compute, apply), keeping the callback unchanged.`, ON_HELPER_MIGRATION_GUIDE),
      },
    });
  }

  if (rewrites.length > 0) {
    const imported = on.specifier.field("alias") ?? on.specifier.field("name")!;
    const remaining = identifierReferences(rootNode, on.local, [imported]).filter(
      (reference) => !rewrittenOnCallees.has(reference.id()),
    );
    const removal = remaining.length === 0 ? removeImportedSpecifier(on.statement, on.specifier) : null;
    if (removal !== null) {
      const start = on.specifier.range().start;
      rewrites.push({
        node: on.specifier,
        entry: {
          edit: removal,
          report: rewrite(filename, start, `Remove the on import from solid-js; every use is now a split createEffect.`, ON_HELPER_MIGRATION_GUIDE),
        },
      });
    }
  }

  return rewrites
    .sort((left, right) => left.node.range().start.index - right.node.range().start.index)
    .map(({ entry }) => entry);
}

function argumentList(call: SgNode<TSX>): SgNode<TSX>[] | null {
  const list = call.field("arguments");
  if (list === null || list.kind() !== "arguments") return null;
  const children = list.children();
  if (children.some((child) => child.kind() === "comment")) return null;
  const values = children.filter((child) => child.isNamed());
  if (values.some((value) => value.kind() === "spread_element")) return null;
  return values;
}

/** Local names of the file's proven `createSignal` and `createMemo` imports from solid-js. */
function getterFactories(rootNode: SgNode<TSX>): { signal: string | null; memo: string | null } {
  return {
    signal: provenImport(rootNode, CORE_MODULE, "createSignal")?.local ?? null,
    memo: provenImport(rootNode, CORE_MODULE, "createMemo")?.local ?? null,
  };
}

/** The compute callback text for a dependency, or null when it is not provable. */
function computeFor(
  dep: SgNode<TSX>,
  rootNode: SgNode<TSX>,
  factories: { signal: string | null; memo: string | null },
): string | null {
  if (dep.kind() === "arrow_function") {
    return parameterCount(dep) === 0 ? dep.text() : null;
  }
  if (dep.kind() !== "identifier") return null;
  const bindings = findBindings(rootNode, dep.text());
  if (bindings.length !== 1) return null;
  if (isGetterBinding(bindings[0]!, factories)) return `() => ${dep.text()}()`;
  // A memo imported from another project file, proven there.
  const imported = importedConstDeclaration(rootNode, dep.text());
  if (imported === null) return null;
  const memo = getterFactories(imported.rootNode).memo;
  const value = imported.declarator.field("value");
  return memo !== null && value?.kind() === "call_expression" && value.field("function")?.text() === memo
    ? `() => ${dep.text()}()`
    : null;
}

/**
 * True for `[x] = createSignal(...)` (first element) or `const x =
 * createMemo(...)`, where the factory is the proven solid-js import.
 */
function isGetterBinding(
  binding: SgNode<TSX>,
  factories: { signal: string | null; memo: string | null },
): boolean {
  const parent = binding.parent();
  if (parent === null) return false;
  if (parent.kind() === "variable_declarator") {
    const value = parent.field("value");
    return factories.memo !== null && value?.kind() === "call_expression" && value.field("function")?.text() === factories.memo;
  }
  if (parent.kind() !== "array_pattern") return false;
  const first = parent.children().find((child) => child.isNamed() && child.kind() !== "comment");
  if (first?.id() !== binding.id()) return false;
  const declarator = parent.parent();
  const value = declarator?.kind() === "variable_declarator" ? declarator.field("value") : null;
  return factories.signal !== null && value?.kind() === "call_expression" && value.field("function")?.text() === factories.signal;
}

function parameterCount(fn: SgNode<TSX>): number {
  if (fn.field("parameter") !== null) return 1;
  const parameters = fn.field("parameters");
  if (parameters === null) return 0;
  return parameters.children().filter((child) => child.isNamed() && child.kind() !== "comment").length;
}

function splittableCallback(fn: SgNode<TSX>): boolean {
  if (fn.kind() !== "arrow_function" && fn.kind() !== "function_expression") return false;
  if (fn.children().some((child) => child.kind() === "async" || child.kind() === "*")) return false;
  if (parameterCount(fn) > 2) return false;
  const parameters = fn.field("parameters");
  if (parameters !== null && parameters.children().some((child) => child.kind() === "rest_pattern")) return false;
  const body = fn.field("body");
  if (body === null || body.kind() !== "statement_block") return false;
  for (const statement of body.findAll({ rule: { kind: "return_statement" } })) {
    if (enclosingFunction(statement)?.id() !== fn.id()) continue;
    if (statement.children().some((child) => child.isNamed() && child.kind() !== "comment")) return false;
  }
  if (fn.findAll({ rule: { kind: "yield_expression" } }).length > 0) return false;
  for (const name of directCalleeNames(fn)) if (OWNER_DEPENDENT.has(name)) return false;
  return true;
}
