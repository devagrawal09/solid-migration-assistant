import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { lintHint, migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("draft-first-setters");

type SetterSite = {
  node: SgNode<TSX>;
  filename: string;
  shape: "path" | "merge" | "returns" | "value";
  detail: string;
};

/**
 * Reports every use of a `createStore` setter whose 1.x shape has no direct
 * Solid 2 meaning. At rc.21 the plain store setter is
 * `(fn: (state: T) => T | void) => void` (`packages/signals/src/store/
 * types.ts`): it takes one draft callback. Solid 1.9.13's `setStore(...args)`
 * (`packages/solid/store/src/store.ts`) accepted a path followed by a value,
 * an object to merge, or a function whose returned object was **merged** into
 * the store; at rc.21 a wrappable object returned from the draft callback is
 * **adopted as the whole new state** (`packages/signals/src/store/store.ts`,
 * "A returned replacement ... adopted as the incoming truth").
 *
 * The setter binding is the second element of an array pattern initialized
 * by a `createStore` call imported from `solid-js/store` (or `solid-js`), and
 * its references are resolved by the workspace semantic provider, so aliased
 * or shadowed names are never mistaken for it. Four shapes are reported:
 *
 * - **path**: two or more arguments (`setStore("user", "name", v)`);
 * - **merge**: one non-function argument (`setStore({ count: 1 })`);
 * - **returns**: one function argument that returns a value (an expression
 *   body, or a block containing a `return` with a value), whose 1.x merge
 *   semantics differ from the 2.0 replacement semantics; and
 * - **value**: any non-call reference (`onClick={setStore}`, `use(setStore)`),
 *   whose call shape cannot be classified here.
 *
 * A one-argument call whose function has a block body with no value return
 * is already the draft form and is not reported.
 */
export function analyzeStoreSetterCalls(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  const sites = new Map<string, SetterSite>();

  for (const statement of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const source = statement.children().find((child) => child.is("string"));
    const moduleName = source ? stringLiteralValue(source) : null;
    if (moduleName !== "solid-js/store" && moduleName !== "solid-js") continue;
    for (const specifier of statement.findAll({ rule: { kind: "import_specifier" } })) {
      const name = specifier.field("name");
      if (name === null || name.text() !== "createStore") continue;
      const local = specifier.field("alias") ?? name;
      for (const fileReferences of local.references()) {
        for (const reference of fileReferences.nodes) {
          const setter = setterBindingOf(reference);
          if (setter === null) continue;
          for (const setterReferences of setter.references()) {
            const filename = setterReferences.root.relativeFilename().replaceAll("\\", "/");
            for (const use of setterReferences.nodes) {
              const site = classify(use, filename);
              if (site !== null) sites.set(`${filename}:${site.node.id()}`, site);
            }
          }
        }
      }
    }
  }

  return [...sites.values()]
    .sort((left, right) => {
      const a = left.node.range().start;
      const b = right.node.range().start;
      return left.filename.localeCompare(right.filename) || a.line - b.line || a.column - b.column;
    })
    .map(guidance);
}

/**
 * The setter identifier of `const [store, setStore] = createStore(...)` when
 * `reference` is the `createStore` callee of that initializer, else null.
 */
function setterBindingOf(reference: SgNode<TSX>): SgNode<TSX> | null {
  const call = reference.parent();
  if (call === null || call.kind() !== "call_expression") return null;
  if (call.field("function")?.id() !== reference.id()) return null;
  const declarator = call.parent();
  if (declarator === null || declarator.kind() !== "variable_declarator") return null;
  const pattern = declarator.field("name");
  if (pattern === null || pattern.kind() !== "array_pattern") return null;
  const elements = pattern.children().filter((child) => child.isNamed() && child.kind() !== "comment");
  const setter = elements[1];
  return setter !== undefined && setter.kind() === "identifier" ? setter : null;
}

function classify(use: SgNode<TSX>, filename: string): SetterSite | null {
  const parent = use.parent();
  if (parent === null) return null;
  if (parent.kind() === "variable_declarator" || parent.kind() === "array_pattern") return null;

  if (parent.kind() !== "call_expression" || parent.field("function")?.id() !== use.id()) {
    return { node: use, filename, shape: "value", detail: "" };
  }

  const argumentNodes = (parent.field("arguments")?.children() ?? []).filter(
    (child) => child.isNamed() && child.kind() !== "comment",
  );
  if (argumentNodes.length === 0) return null;
  if (argumentNodes.some((argument) => argument.kind() === "spread_element")) {
    return { node: parent, filename, shape: "value", detail: "" };
  }
  if (argumentNodes.length >= 2) {
    return { node: parent, filename, shape: "path", detail: ` This call passes ${argumentNodes.length} arguments.` };
  }

  const only = argumentNodes[0]!;
  if (only.kind() === "arrow_function" || only.kind() === "function_expression") {
    return returnsValue(only) ? { node: parent, filename, shape: "returns", detail: "" } : null;
  }
  const kind = only.kind().replaceAll("_", " ");
  return { node: parent, filename, shape: "merge", detail: ` The argument is ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}.` };
}

/** True for an expression-bodied arrow or a body containing `return <value>` outside nested functions. */
function returnsValue(fn: SgNode<TSX>): boolean {
  const body = fn.field("body");
  if (body === null) return false;
  if (body.kind() !== "statement_block") return true;
  for (const statement of body.findAll({ rule: { kind: "return_statement" } })) {
    const nested = statement
      .ancestors()
      .find((ancestor) =>
        ancestor.id() === fn.id() ||
        ancestor.kind() === "arrow_function" ||
        ancestor.kind() === "function_expression" ||
        ancestor.kind() === "function_declaration" ||
        ancestor.kind() === "method_definition",
      );
    if (nested !== undefined && nested.id() !== fn.id()) continue;
    if (statement.children().some((child) => child.isNamed() && child.kind() !== "comment")) return true;
  }
  return false;
}

function guidance({ node, filename, shape, detail }: SetterSite): string {
  const start = node.range().start;
  const location = `${filename}:${start.line + 1}:${start.column + 1}`;
  const why = `Why: Solid ${SOLID_TARGET_VERSION}'s plain store setter accepts only a draft callback, setStore(state => { ... }); Solid 1.x also accepted a path followed by a value, an object to merge, and a function whose returned object was merged into the store, while a value returned from the 2.0 draft callback is adopted as the whole new state instead.`;
  const shared = ` Make and validate that edit yourself; this analyzer never edits or runs the target project.${lintHint("no-store-mutation-outside-setter")} Official migration guide: ${MIGRATION_GUIDE}`;
  switch (shape) {
    case "path":
      return `${location} Manual review required: rewrite this path-style store setter call as a draft write.${detail}
${why}
Guidance: Read the path segments and the final value. Replace the call with setStore(state => { ... }) that walks the same path on the draft: a string or number segment becomes a property access, an array of keys becomes a loop over those keys, a range becomes a loop over its indices, a filter function becomes a loop with an if, and a final function value becomes a read-modify-write of the draft property. Setting undefined to remove a key becomes delete.${shared}`;
    case "merge":
      return `${location} Manual review required: rewrite this object-merge store setter call as draft assignments.${detail}
${why}
Guidance: Read the argument and the store shape. Replace the call with setStore(state => { ... }) that assigns each top-level key of the argument onto the draft; nested objects that 1.x merged shallowly must be assigned per key too if other keys at that level must survive.${shared}`;
    case "returns":
      return `${location} Manual review required: review the value this store setter callback returns.
${why}
Guidance: Read the callback's return value and every key it omits. If it was spreading the previous state to produce a merged object, mutate the draft in place and return nothing. If it intentionally replaces the whole store, keep the return but confirm every consumer accepts the replacement, since keys missing from the returned object no longer survive.${shared}`;
    default:
      return `${location} Manual review required: trace this store setter that is passed as a value.
${why}
Guidance: Find every call made through this reference (an event handler, a helper, a child component prop) and classify its arguments as above: paths and object merges become draft callbacks, and returned objects replace instead of merge. Stop and ask for the call sites when the reference escapes to code outside this project.${shared}`;
  }
}
