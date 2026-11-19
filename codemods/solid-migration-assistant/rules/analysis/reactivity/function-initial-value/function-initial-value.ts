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
 *
 * A value whose type the caller decides may be a function too, and is
 * reported for review: a parameter typed with one of the enclosing
 * function's type parameters (or unknown or any), a const holding what a
 * parameter returns (`selector(state)`), or any argument when the call's
 * own type argument is such a type parameter (`createSignal<T>(value)`).
 * A `typeof value === "function"` check in the enclosing function means the
 * author handled it, so that value is skipped.
 */
export function analyzeFunctionInitialValue(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const calls = [
    ...findImportedCalls(rootNode, "solid-js", "createSignal").map((call) => ({ ...call, primitive: "createSignal" })),
    ...findImportedCalls(rootNode, ["solid-js/store", "solid-js"], "createStore").map((call) => ({ ...call, primitive: "createStore" })),
  ];
  return calls.flatMap(({ call, argumentNodes, filename, primitive }) => {
      const value = argumentNodes[0];
      if (value === undefined) return [];
      if (!isFunction(value, call.getRoot().root())) {
        const generic = callerTyped(value, call);
        if (generic === null) return [];
        const shown = value.text();
        return [finding(filename, value, {
          severity: "behavior",
          headline: `Check whether ${shown} can be a function; ${primitive} would run it as a derived ${primitive === "createSignal" ? "signal" : "store"}.`,
          why: `${generic}, so the caller decides what it holds and it can be a function. Solid 1.x stored a function passed to ${primitive} as the initial value. Solid ${SOLID_TARGET_VERSION} treats ${primitive}(fn) as a derived ${primitive === "createSignal" ? "signal" : "store"} and calls fn, so the value becomes whatever fn returns.`,
          guidance: primitive === "createSignal"
            ? `If it can hold a function, pass ${primitive}(() => ${shown}): the derived form returns ${shown} unchanged whether or not it is a function. Setters have the same rule in both versions: pass setX(() => next) when next can be a function. If it can never be a function, narrow its type so the reader can tell.`
            : `A store's initial value must be an object or array. If ${shown} can be a function (or a primitive), box it, createStore({ value: ${shown} }), or keep it in a signal instead.`,
          guide: MIGRATION_GUIDE,
        })];
      }
      const shown = value.kind() === "identifier" ? value.text() : "this function";
      return [finding(filename, value, {
        severity: "behavior",
        headline: primitive === "createSignal"
          ? `Keep ${shown} as createSignal's value instead of a derived computation.`
          : `Check this createStore(fn) call, which Solid 2 runs as a derived store.`,
        why: `Solid 1.x stored a function passed to ${primitive} as the initial value. Solid ${SOLID_TARGET_VERSION} treats ${primitive}(fn) as a derived ${primitive === "createSignal" ? "signal" : "store"} and calls fn, so the value becomes whatever fn returns.`,
        guidance: primitive === "createSignal"
          ? `If the signal holds a function (a handler, a component, a formatter), wrap it: ${primitive}(() => ${value.kind() === "identifier" ? value.text() : "<this function>"}). Setter calls that already pass () => nextFn keep working. If the intent was a value computed from other signals, this is the new derived form and nothing changes.`
          : `A store's initial value must be an object or array. If this function computes the state from other signals, this is the new derived store form and takes a seed as the second argument; otherwise pass the object itself.`,
        guide: MIGRATION_GUIDE,
      })];
    });
}

/**
 * Why `value`'s type is the caller's, or null: the call's type argument, or
 * the value (an identifier, looking through `as`, `satisfies` and `!`) is a
 * parameter typed with a type parameter of the function that declares it, or
 * unknown or any, or a const initialized by calling a parameter.
 */
function callerTyped(value: SgNode<TSX>, call: SgNode<TSX>): string | null {
  const scope = call.ancestors().find((ancestor) => FUNCTION_KINDS.has(ancestor.kind()) || ancestor.kind() === "function_declaration" || ancestor.kind() === "method_definition");
  if (scope === undefined) return null;
  const typeParameters = new Set(
    call.ancestors()
      .flatMap((ancestor) => ancestor.field("type_parameters")?.findAll({ rule: { kind: "type_identifier", inside: { kind: "type_parameter", stopBy: "neighbor" } } }) ?? [])
      .map((name) => name.text()),
  );
  const callerType = (type: string) => typeParameters.has(type) || type === "unknown" || type === "any";
  let inner = value;
  while (["as_expression", "satisfies_expression", "non_null_expression", "parenthesized_expression"].includes(inner.kind())) {
    const first = inner.child(inner.kind() === "parenthesized_expression" ? 1 : 0);
    if (first === null) break;
    inner = first;
  }
  // A literal is never a function, whatever it is cast to.
  if (["undefined", "null", "number", "string", "template_string", "true", "false", "object", "array"].includes(inner.kind())) return null;
  const typeArgument = call.field("type_arguments")?.children().find((child) => child.isNamed());
  if (typeArgument !== undefined && callerType(typeArgument.text())) return `${call.field("function")?.text()} is typed with ${typeArgument.text()}`;
  if (inner.kind() !== "identifier") return null;
  const name = inner.text();
  // The author already handles a function value.
  if (new RegExp(`typeof\\s+${name.replace(/\$/g, "\\$")}\\s*[!=]==?\\s*["']function["']`).test(scope.text())) return null;
  const parameters = call.ancestors().flatMap((ancestor) => ancestor.field("parameters")?.children() ?? []);
  const parameterNames = new Set(parameters.map((parameter) => parameter.field("pattern")?.text()));
  for (const parameter of parameters) {
    if (parameter.field("pattern")?.text() !== name) continue;
    const type = parameter.field("type")?.text().replace(/^:\s*/, "");
    return type !== undefined && callerType(type) ? `${name} is a parameter typed ${type}` : null;
  }
  // The const the enclosing function declares under that name, once.
  const declarators = scope.findAll({ rule: { kind: "variable_declarator" } }).filter((candidate) => candidate.field("name")?.text() === name);
  const declarator = declarators.length === 1 ? declarators[0]! : null;
  let initializer = declarator?.kind() === "variable_declarator" ? declarator.field("value") : null;
  while (initializer !== null && initializer !== undefined && ["as_expression", "satisfies_expression", "non_null_expression"].includes(initializer.kind())) initializer = initializer.child(0);
  const callee = initializer?.kind() === "call_expression" ? initializer.field("function") : null;
  if (callee?.kind() === "identifier" && parameterNames.has(callee.text())) return `${name} is what the ${callee.text()} parameter returns`;
  return null;
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
