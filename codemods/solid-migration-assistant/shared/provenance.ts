import { parse, type SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "./analysis.ts";
import { findBindings } from "./bindings.ts";
import { definitionOf } from "./semantic.ts";

/** A `const` declaration in another project file, proven through an import. */
export type ImportedDeclaration = {
  /** The `variable_declarator` in the declaring file. */
  declarator: SgNode<TSX>;
  /** The declaring file's root node, for proofs about its own imports. */
  rootNode: SgNode<TSX>;
  /** The declaring file, relative to the workflow target. */
  filename: string;
};

/**
 * The `const` declarator that the binding `local` in this file is, through a
 * named import from another project file, resolved by the workspace semantic
 * provider. This is how a transform proves a cross-file fact; the caller then
 * proves what the declarator's value is, syntactically, in its own file.
 *
 * Proven only when all of the following hold, else null:
 *
 * - `local` is bound exactly once in this file, by a non-type named import
 *   (an alias is fine) from a relative module (`./` or `../`), so it is
 *   project source rather than a package;
 * - the provider resolves it to an identifier in a different file outside
 *   `node_modules` (it cannot follow default exports, re-exports, namespace
 *   imports, destructured exports, or files it cannot parse, all of which
 *   stay null); and
 * - that identifier is the name of a plain (not destructured) `const`
 *   declarator, bound exactly once in its file, so nothing reassigns or
 *   shadows it there.
 */
export function importedConstDeclaration(rootNode: SgNode<TSX>, local: string): ImportedDeclaration | null {
  const specifiers: SgNode<TSX>[] = [];
  for (const statement of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (statement.children().some((child) => child.kind() === "type")) continue;
    const source = statement.children().find((child) => child.is("string"));
    const module = source ? stringLiteralValue(source) : null;
    if (module === null || !/^\.\.?\//.test(module)) continue;
    for (const specifier of statement.findAll({ rule: { kind: "import_specifier" } })) {
      if (specifier.children().some((child) => child.kind() === "type")) continue;
      const binding = specifier.field("alias") ?? specifier.field("name");
      if (binding !== null && binding.kind() === "identifier" && binding.text() === local) specifiers.push(binding);
    }
  }
  if (specifiers.length !== 1 || findBindings(rootNode, local).length !== 1) return null;

  const definition = definitionOf(specifiers[0]!);
  if (definition === null || definition.kind !== "external" || definition.node.kind() !== "identifier") return null;
  const filename = definition.root.relativeFilename().replaceAll("\\", "/");
  if (filename === rootNode.getRoot().relativeFilename().replaceAll("\\", "/")) return null;
  if (/(?:^|\/)node_modules\//.test(filename) || filename.startsWith("../")) return null;

  // The provider parses each file with its own grammar (plain JavaScript for
  // .js and .jsx), so the declaring file is re-parsed as TSX, the language
  // every rule is written against, and the same identifier found by offset.
  const declaringRoot = parse<TSX>("tsx", definition.root.root().text()).root();
  const offset = definition.node.range().start.index;
  const name = declaringRoot
    .findAll({ rule: { kind: "identifier" } })
    .find((node) => node.range().start.index === offset && node.text() === definition.node.text());
  if (name === undefined) return null;
  const declarator = name.parent();
  if (declarator === null || declarator.kind() !== "variable_declarator") return null;
  if (declarator.field("name")?.id() !== name.id()) return null;
  const declaration = declarator.parent();
  if (
    declaration === null ||
    declaration.kind() !== "lexical_declaration" ||
    !declaration.children().some((child) => child.kind() === "const")
  ) {
    return null;
  }
  if (findBindings(declaringRoot, name.text()).length !== 1) return null;
  return { declarator, rootNode: declaringRoot, filename };
}
