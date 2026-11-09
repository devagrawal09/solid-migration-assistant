import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "./analysis.ts";
import { findBindings } from "./bindings.ts";

/** One named import specifier and the statement that holds it. */
export type NamedImport = {
  statement: SgNode<TSX>;
  specifier: SgNode<TSX>;
  /** The binding name in this file (the alias when there is one). */
  local: string;
};

/**
 * Every non-type named import of `name` from `module` in the file. Type-only
 * statements and inline `type` specifiers are skipped, since they bind no
 * runtime value.
 */
export function namedImports(rootNode: SgNode<TSX>, module: string, name: string): NamedImport[] {
  const found: NamedImport[] = [];
  for (const statement of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const source = statement.children().find((child) => child.is("string"));
    if (!source || stringLiteralValue(source) !== module) continue;
    if (statement.children().some((child) => child.kind() === "type")) continue;
    for (const specifier of statement.findAll({ rule: { kind: "import_specifier" } })) {
      if (specifier.children().some((child) => child.kind() === "type")) continue;
      const imported = specifier.field("name");
      if (imported === null || imported.kind() !== "identifier" || imported.text() !== name) continue;
      const local = (specifier.field("alias") ?? imported).text();
      found.push({ statement, specifier, local });
    }
  }
  return found;
}

/**
 * The single provable import of `name` from `module`: exactly one non-type
 * named import whose local name is bound nowhere else in the file. Null when
 * there is none, more than one, or the local name is shadowed.
 */
export function provenImport(rootNode: SgNode<TSX>, module: string, name: string): NamedImport | null {
  const imports = namedImports(rootNode, module, name);
  const only = imports.length === 1 ? imports[0]! : null;
  if (only === null) return null;
  return findBindings(rootNode, only.local).length === 1 ? only : null;
}

/**
 * An edit removing one specifier from its import. A sole specifier removes
 * the whole statement and the line break after it; otherwise the specifier
 * goes with one adjacent comma. Null when the named-import list contains a
 * comment or the statement also has a default or namespace clause, so that
 * nothing the author wrote is silently dropped.
 */
export function removeImportedSpecifier(statement: SgNode<TSX>, specifier: SgNode<TSX>): Edit | null {
  const list = specifier.parent();
  if (list === null || list.kind() !== "named_imports") return null;
  if (list.children().some((child) => child.kind() === "comment")) return null;
  const clause = list.parent();
  if (clause === null || clause.children().some((child) => child.isNamed() && child.id() !== list.id() && child.kind() !== "comment")) {
    return null;
  }
  const specifiers = list.children().filter((child) => child.kind() === "import_specifier");
  if (specifiers.length === 1) {
    const root = statement.getRoot().root();
    const text = root.text();
    let end = statement.range().end.index;
    if (text[end] === "\r") end += 1;
    if (text[end] === "\n") end += 1;
    return { startPos: statement.range().start.index, endPos: end, insertedText: "" };
  }
  const siblings = list.children();
  const position = siblings.findIndex((child) => child.id() === specifier.id());
  const next = siblings[position + 1];
  const afterNext = siblings[position + 2];
  const previous = siblings[position - 1];
  const beforePrevious = siblings[position - 2];
  if (next?.kind() === "," && afterNext?.kind() === "import_specifier") {
    return { startPos: specifier.range().start.index, endPos: afterNext.range().start.index, insertedText: "" };
  }
  if (previous?.kind() === "," && beforePrevious?.kind() === "import_specifier") {
    return { startPos: beforePrevious.range().end.index, endPos: specifier.range().end.index, insertedText: "" };
  }
  return null;
}

/** Plain-identifier references to `name` in the file other than `exclude`. */
export function identifierReferences(rootNode: SgNode<TSX>, name: string, exclude: SgNode<TSX>[]): SgNode<TSX>[] {
  const excluded = new Set(exclude.map((node) => node.id()));
  const pattern = `^${name.replace(/[$^\\.*+?()[\]{}|]/g, "\\$&")}$`;
  const kinds = ["identifier", "shorthand_property_identifier", "shorthand_property_identifier_pattern"] as const;
  return kinds
    .flatMap((kind) => rootNode.findAll({ rule: { kind, regex: pattern } }))
    .filter((node) => !excluded.has(node.id()));
}
