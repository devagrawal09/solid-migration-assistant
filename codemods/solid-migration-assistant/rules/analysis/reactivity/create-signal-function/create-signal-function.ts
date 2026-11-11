import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE = migrationGuide(
  "new-function-forms-createsignalfn-and-createstorefn",
);

/**
 * Reports a silent behavior change at the `createSignal` and `createStore`
 * call shape introduced by Solid 2's "new function forms".
 *
 * In Solid 1.9.13 (`packages/solid/src/reactive/signal.ts`), `createSignal`
 * stores its first argument as the current value, whatever it is: a function
 * value was returned literally by the getter. At rc.21 the migration guide's
 * "New function forms: `createSignal(fn)` and `createStore(fn)`" section
 * (anchor `new-function-forms-createsignalfn-and-createstorefn`) states
 * `createSignal(fn)` instead creates a **writable derived signal** — the
 * same declaration becomes a running computation, and the getter returns the
 * computed value, not the function itself. The same change applies to
 * `createStore(fn)`, which becomes a derived store.
 *
 * Reported at `behavior` severity for each call of `createSignal` imported
 * (named or namespace) from `solid-js`, or `createStore` imported from
 * `solid-js/store`, whose first argument is one of:
 *
 * - a syntactic `arrow_function` or `function_expression` literal; or
 * - an identifier the same file proves is a function: either a
 *   `function_declaration` binding of the same name, or a single `const`
 *   `variable_declarator` whose initializer is an arrow or function
 *   expression. Any other single-binding form (`let`, destructuring, import,
 *   parameter, class), a name shadowed or bound more than once, and every
 *   unresolved identifier stay silent — a rule that cannot prove the value
 *   is a function must not claim it is.
 *
 * Spread first arguments are refused, since the call shape is unknown.
 */
export function analyzeCreateSignalFunction(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const findings: RuleFinding[] = [];
  for (const { kind, module, name } of [
    { kind: "signal" as const, module: "solid-js", name: "createSignal" },
    { kind: "store" as const, module: "solid-js/store", name: "createStore" },
  ]) {
    for (const { call, argumentNodes, filename } of findImportedCalls(
      rootNode,
      module,
      name,
    )) {
      if (argumentNodes.length === 0) continue;
      const first = argumentNodes[0]!;
      if (first.kind() === "spread_element") continue;
      if (!isFunctionLikeArgument(first, rootNode)) continue;
      findings.push(buildFinding(kind, name, filename, call));
    }
  }
  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column,
  );
}

function isFunctionLikeArgument(
  argument: SgNode<TSX>,
  rootNode: SgNode<TSX>,
): boolean {
  const kind = argument.kind();
  if (kind === "arrow_function" || kind === "function_expression") return true;
  if (kind !== "identifier") return false;
  const bindings = findBindings(rootNode, argument.text(), { ignoreAmbient: true });
  if (bindings.length !== 1) return false;
  const binding = bindings[0]!;
  const parent = binding.parent();
  if (parent === null) return false;
  if (parent.kind() === "function_declaration") return true;
  if (parent.kind() !== "variable_declarator") return false;
  const declaration = parent.parent();
  if (
    declaration === null ||
    declaration.kind() !== "lexical_declaration" ||
    !declaration.children().some((child) => child.kind() === "const")
  ) {
    return false;
  }
  const value = parent.field("value");
  return (
    value !== null &&
    (value.kind() === "arrow_function" || value.kind() === "function_expression")
  );
}

function buildFinding(
  kind: "signal" | "store",
  name: string,
  filename: string,
  call: SgNode<TSX>,
): RuleFinding {
  const label = kind === "signal" ? "signal" : "store";
  const derived = kind === "signal" ? "writable derived signal" : "derived store";
  return finding(filename, call, {
    severity: "behavior",
    headline: `Review this ${name}(fn) call: a function first argument now creates a ${derived}.`,
    why: `Solid 1.9.13 stored this call's first argument as the ${label}'s initial value, so a function was returned literally by the getter, but Solid ${SOLID_TARGET_VERSION}'s "new function forms" section reads a function first argument as a derived computation (createSignal(fn) returns a writable derived signal; createStore(fn, seed) returns a derived store), so the ${label} now runs the function and tracks its reactive reads.`,
    guidance: `Decide whether a derived ${label} was intended. If a function value was intended, wrap it in another function (${name}(() => theFunction)) or store it elsewhere (a plain let, a ref, or an object property that this ${label} holds) so the getter returns the function itself. If a derived ${label} was intended, keep the call as is and confirm every reader is prepared to re-run on tracked changes${kind === "store" ? " and, when needed, supply a seed as the second argument" : ""}. Stop without proposing a change when the intended value shape is unclear, when the callback reads reactive state with its own timing, or when consumers observe the function identity rather than its result.`,
    guide: MIGRATION_GUIDE,
  });
}
