import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("new-function-forms-createsignalfn-and-createstorefn");
const FUNCTION_KINDS = new Set(["arrow_function", "function_expression", "function"]);

/**
 * Reports `createSignal(fn)` and `createStore(fn)` where `fn` is a function
 * literal or a name this file binds once to a function. Solid 1.x stored the
 * function as the initial value; Solid 2.0.3 calls it as a derived
 * computation. Checked on the 2.0.0 browser build: with
 * `const handler = () => "handler"`, `createSignal(handler)` reads back the
 * string "handler", and `createSignal(() => handler)` reads back the function.
 */
export function analyzeFunctionInitialValue(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const calls = [
    ...findImportedCalls(rootNode, "solid-js", "createSignal").map((call) => ({ ...call, primitive: "createSignal" })),
    ...findImportedCalls(rootNode, ["solid-js/store", "solid-js"], "createStore").map((call) => ({ ...call, primitive: "createStore" })),
  ];
  return calls
    .filter(({ argumentNodes, call }) => argumentNodes[0] !== undefined && isFunction(argumentNodes[0], call.getRoot().root()))
    .map(({ call, argumentNodes, filename, primitive }) => {
      const value = argumentNodes[0]!;
      const shown = value.kind() === "identifier" ? value.text() : "this function";
      return finding(filename, value, {
        severity: "behavior",
        headline: primitive === "createSignal"
          ? `Keep ${shown} as createSignal's value instead of a derived computation.`
          : `Check this createStore(fn) call, which Solid 2 runs as a derived store.`,
        why: `Solid 1.x stored a function passed to ${primitive} as the initial value. Solid ${SOLID_TARGET_VERSION} treats ${primitive}(fn) as a derived ${primitive === "createSignal" ? "signal" : "store"} and calls fn, so the value becomes whatever fn returns.`,
        guidance: primitive === "createSignal"
          ? `If the signal holds a function (a handler, a component, a formatter), wrap it: ${primitive}(() => ${value.kind() === "identifier" ? value.text() : "<this function>"}). Setter calls that already pass () => nextFn keep working. If the intent was a value computed from other signals, this is the new derived form and nothing changes.`
          : `A store's initial value must be an object or array. If this function computes the state from other signals, this is the new derived store form and takes a seed as the second argument; otherwise pass the object itself.`,
        guide: MIGRATION_GUIDE,
      });
    });
}

function isFunction(value: SgNode<TSX>, root: SgNode<TSX>): boolean {
  if (FUNCTION_KINDS.has(value.kind())) return !returnsFunctionDirectly(value);
  if (value.kind() !== "identifier") return false;
  const bindings = findBindings(root, value.text());
  if (bindings.length !== 1) return false;
  const declaration = bindings[0]!.parent();
  if (declaration?.kind() === "function_declaration") return true;
  if (declaration?.kind() !== "variable_declarator" || declaration.field("name")?.id() !== bindings[0]!.id()) return false;
  const initializer = declaration.field("value");
  return initializer !== null && FUNCTION_KINDS.has(initializer.kind());
}

/** `() => fn` or `() => () => ...`: the Solid 2 way to keep a function as the value. */
function returnsFunctionDirectly(fn: SgNode<TSX>): boolean {
  const body = fn.field("body");
  return body !== null && (body.kind() === "identifier" || FUNCTION_KINDS.has(body.kind()));
}
