import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { enclosingFunction, findImportedCalls } from "./analysis.ts";

/** The two names of `const [x, setX] = createSignal(...)` or `createStore(...)`. */
export type StatePair = { kind: "signal" | "store"; getter: SgNode<TSX>; setter: SgNode<TSX>; call: SgNode<TSX> };

const SOURCES = [
  { kind: "signal" as const, modules: ["solid-js"], name: "createSignal" },
  { kind: "store" as const, modules: ["solid-js/store", "solid-js"], name: "createStore" },
];

/** Every signal and store in the file declared by array destructuring with both names as identifiers. */
export function statePairs(rootNode: SgNode<TSX>): StatePair[] {
  const found: StatePair[] = [];
  for (const { kind, modules, name } of SOURCES) {
    for (const { call } of findImportedCalls(rootNode, modules, name)) {
      const declarator = call.parent();
      if (declarator?.kind() !== "variable_declarator") continue;
      const pattern = declarator.field("name");
      if (pattern?.kind() !== "array_pattern") continue;
      const [getter, setter] = pattern.children().filter((child) => child.isNamed() && child.kind() !== "comment");
      if (getter?.kind() === "identifier" && setter?.kind() === "identifier") found.push({ kind, getter, setter, call });
    }
  }
  return found;
}

/** The call whose callee is `reference`, or null. */
export function calleeOf(reference: SgNode<TSX>): SgNode<TSX> | null {
  const call = reference.parent();
  return call?.kind() === "call_expression" && call.field("function")?.id() === reference.id() ? call : null;
}

/**
 * The function whose body runs `node`, looking through `untrack(() => ...)`,
 * whose callback runs in place. Null at module scope.
 */
export function runningFunction(node: SgNode<TSX>): SgNode<TSX> | null {
  let fn = enclosingFunction(node);
  while (fn !== null && runsInPlace(fn)) fn = enclosingFunction(fn);
  return fn;
}

function runsInPlace(fn: SgNode<TSX>): boolean {
  const call = fn.parent()?.parent();
  return call?.kind() === "call_expression" && call.field("function")?.text() === "untrack";
}
