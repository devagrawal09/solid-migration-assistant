import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import { identifierReferences, provenImport } from "../../../../shared/imports.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";
import { rewrite, type RuleRewrite } from "../../../../shared/finding.ts";

export const STORE_SETTER_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#draft-first-setters`;

const LEGACY_STORE_MODULE = "solid-js/store";
const CORE_MODULE = "solid-js";
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type StoreSetterRewrite = {
  edit: Edit;
  report: RuleRewrite;
};

/**
 * The automatic subset of the Solid 2 store setter change.
 *
 * Solid 1.9.13's `setStore(...path, value)` (`packages/solid/store/src/
 * store.ts`, `updatePath` and `setProperty`) walks the path and, when the
 * final value is not a function and not an object to merge, calls
 * `setProperty`, which assigns the value, deletes the key when the value is
 * `undefined`, and does nothing when the value is unchanged. At
 * 2.0.0-rc.21 the plain store setter is
 * `(fn: (state: T) => T | void) => void` (`packages/signals/src/store/
 * types.ts`): it accepts only a draft callback, and the migration guide maps
 * a 1.x path setter onto a draft write to the same path, with setting
 * `undefined` becoming `delete`. A literal final value is never merged,
 * never called, and has no side effects, so for it the two forms make the
 * same change:
 *
 *   setStore("user", "name", "Ann")   ->   setStore((draft) => { draft.user.name = "Ann"; })
 *   setStore("user", "nick", undefined) -> setStore((draft) => { delete draft.user.nick; })
 *
 * A call is rewritten only when all of the following hold:
 *
 * - `createStore` is the file's single non-type named import from
 *   `solid-js/store` (an alias is fine), bound nowhere else;
 * - the setter is the second element of `const [state, setX] =
 *   createStore(...)`, bound exactly once in the file;
 * - the call is a whole expression statement (its result is unused) with at
 *   least two arguments and no comments, spreads, or other syntax inside the
 *   argument list;
 * - every path segment is a string literal (not `__proto__`, `constructor`,
 *   or `prototype`, which 1.x refuses) or a non-negative integer literal; and
 * - the final value is a string, number (optionally negated), `true`,
 *   `false`, `null`, or `undefined` literal, with `undefined` not rebound.
 *
 * When the file calls `createStore` at least once, every reference to it is
 * such a call (never a value passed on or re-exported), every use of every
 * setter it creates is a rewritten call (an exported setter has uses this
 * file cannot see, so it never qualifies), and every `createStore` call starts
 * from an object or array literal with no options, the `solid-js/store`
 * import itself moves to `solid-js`, provided the statement imports only `createStore` (and
 * optionally the `Store` type). Everything else, including object, array,
 * function, and variable values (1.x merged objects and called functions),
 * array-of-keys, range, and filter path segments, setters passed as values,
 * and `produce`, `reconcile`, `unwrap`, or `createMutable` in the same
 * statement, is left to the analyzer.
 */
export function rewriteStoreSetterLiteralPaths(
  rootNode: SgNode<TSX>,
  filename: string,
): StoreSetterRewrite[] {
  const store = provenImport(rootNode, LEGACY_STORE_MODULE, "createStore");
  if (store === null) return [];

  const rewrites: { node: SgNode<TSX>; entry: StoreSetterRewrite }[] = [];
  let everyUseRewritten = true;
  let everyStoreLiteral = true;
  const analyzedCallees = new Set<number>();

  for (const call of rootNode.findAll({ rule: { kind: "call_expression" } })) {
    const callee = call.field("function");
    if (callee === null || callee.kind() !== "identifier" || callee.text() !== store.local) continue;
    analyzedCallees.add(callee.id());
    const declarator = call.parent();
    const pattern = declarator?.kind() === "variable_declarator" ? declarator.field("name") : null;
    const declaration = declarator?.parent() ?? null;
    const setter =
      pattern !== null && pattern.kind() === "array_pattern"
        ? pattern.children().filter((child) => child.isNamed() && child.kind() !== "comment")[1]
        : undefined;
    const constDeclaration =
      declaration !== null &&
      declaration.kind() === "lexical_declaration" &&
      declaration.children().some((child) => child.kind() === "const");
    const initial = argumentList(call);
    if (
      initial === null ||
      initial.length !== 1 ||
      (initial[0]!.kind() !== "object" && initial[0]!.kind() !== "array")
    ) {
      everyStoreLiteral = false;
    }
    if (setter === undefined || setter.kind() !== "identifier" || !constDeclaration) {
      everyUseRewritten = false;
      continue;
    }
    if (findBindings(rootNode, setter.text()).length !== 1) {
      everyUseRewritten = false;
      continue;
    }
    // An exported setter may be called from files this rule never sees (the
    // semantic provider does not follow destructured exports), so its calls
    // here are still rewritten but the import cannot move.
    if (declaration?.parent()?.kind() === "export_statement") everyUseRewritten = false;
    for (const use of identifierReferences(rootNode, setter.text(), [setter])) {
      const entry = rewriteUse(use, filename);
      if (entry === null) everyUseRewritten = false;
      else rewrites.push({ node: use, entry });
    }
  }

  // The import moves only when the file calls createStore at least once and
  // every reference to it is one of those calls: a createStore passed as a
  // value or re-exported could create stores whose setters were never seen.
  const imported = store.specifier.field("alias") ?? store.specifier.field("name")!;
  const references = identifierReferences(rootNode, store.local, [imported]);
  const everyReferenceAnalyzed =
    references.length > 0 && references.every((reference) => analyzedCallees.has(reference.id()));
  const relocation =
    everyReferenceAnalyzed && everyUseRewritten && everyStoreLiteral
      ? relocateImport(store.statement, filename)
      : null;
  if (relocation !== null) rewrites.push({ node: store.statement, entry: relocation });

  return rewrites
    .sort((left, right) => left.node.range().start.index - right.node.range().start.index)
    .map(({ entry }) => entry);
}

/** The call's arguments, or null when the list holds comments or spreads. */
function argumentList(call: SgNode<TSX>): SgNode<TSX>[] | null {
  const list = call.field("arguments");
  if (list === null || list.kind() !== "arguments") return null;
  const children = list.children();
  if (children.some((child) => child.kind() === "comment")) return null;
  const values = children.filter((child) => child.isNamed());
  if (values.some((value) => value.kind() === "spread_element")) return null;
  return values;
}

function rewriteUse(use: SgNode<TSX>, filename: string): StoreSetterRewrite | null {
  const call = use.parent();
  if (call === null || call.kind() !== "call_expression" || call.field("function")?.id() !== use.id()) return null;
  if (call.parent()?.kind() !== "expression_statement") return null;
  const values = argumentList(call);
  if (values === null || values.length < 2) return null;

  const segments: string[] = [];
  for (const segment of values.slice(0, -1)) {
    const access = pathAccess(segment);
    if (access === null) return null;
    segments.push(access);
  }
  const value = literalValue(values[values.length - 1]!, use.getRoot().root());
  if (value === null) return null;

  const target = `draft${segments.join("")}`;
  const statement = value === "undefined" ? `delete ${target};` : `${target} = ${value};`;
  const start = call.range().start;
  return {
    edit: call.field("arguments")!.replace(`((draft) => { ${statement} })`),
    report: rewrite(filename, start, `Rewrite this path-style store setter call with a literal value as a draft write.`, STORE_SETTER_MIGRATION_GUIDE),
  };
}

/** `.key`, `["key"]`, or `[0]` for one literal path segment, else null. */
function pathAccess(segment: SgNode<TSX>): string | null {
  if (segment.kind() === "number") {
    return /^(?:0|[1-9][0-9]*)$/.test(segment.text()) ? `[${segment.text()}]` : null;
  }
  if (segment.kind() !== "string") return null;
  const key = stringLiteralValue(segment);
  if (key === null || UNSAFE_KEYS.has(key)) return null;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

/** The source text of a side-effect-free literal value, or null. */
function literalValue(value: SgNode<TSX>, rootNode: SgNode<TSX>): string | null {
  switch (value.kind()) {
    case "string":
    case "number":
    case "true":
    case "false":
    case "null":
      return value.text();
    case "unary_expression": {
      const operand = value.field("argument");
      const operator = value.children().find((child) => !child.isNamed());
      return operator?.text() === "-" && operand?.kind() === "number" ? value.text() : null;
    }
    case "undefined":
      return findBindings(rootNode, "undefined").length === 0 ? "undefined" : null;
    case "identifier":
      return value.text() === "undefined" && findBindings(rootNode, "undefined").length === 0 ? "undefined" : null;
    default:
      return null;
  }
}

/**
 * Moves `import { createStore } from "solid-js/store"` to `solid-js` when the
 * statement names nothing else but the `Store` type.
 */
function relocateImport(statement: SgNode<TSX>, filename: string): StoreSetterRewrite | null {
  if (statement.children().some((child) => child.kind() === "import_attribute")) return null;
  const clause = statement.children().find((child) => child.kind() === "import_clause");
  const parts = clause?.children().filter((child) => child.isNamed() && child.kind() !== "comment") ?? [];
  if (parts.length !== 1 || parts[0]!.kind() !== "named_imports") return null;
  for (const specifier of parts[0]!.children().filter((child) => child.kind() === "import_specifier")) {
    const name = specifier.field("name")?.text();
    const typeOnly = specifier.children().some((child) => child.kind() === "type");
    if (name === "createStore" && !typeOnly) continue;
    if (name === "Store" && typeOnly) continue;
    return null;
  }
  const source = statement.children().find((child) => child.is("string"))!;
  const quote = source.text()[0];
  const start = source.range().start;
  return {
    edit: source.replace(`${quote}${CORE_MODULE}${quote}`),
    report: rewrite(filename, start, `Relocate solid-js/store to solid-js for createStore: every setter call in this file is now a draft write.`, STORE_SETTER_MIGRATION_GUIDE),
  };
}
