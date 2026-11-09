import type { DefinitionResult, FileReferences, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findBindings, identifierReferences } from "./bindings.ts";

/**
 * Every reference to the binding whose declaring identifier is `name`,
 * across the workspace when the semantic provider can resolve them.
 *
 * The provider throws when it cannot parse a file it needs (JSX inside a
 * `.js` file, for example), which would otherwise abort the whole rule for
 * the file. Then the references fall back to this file alone, found
 * syntactically, and only when the name is bound exactly once here, so a
 * shadowing binding is never mistaken for this one.
 */
export function referencesOf(name: SgNode<TSX>): FileReferences<TSX>[] {
  try {
    return name.references();
  } catch {
    const root = name.getRoot();
    const rootNode = root.root();
    if (findBindings(rootNode, name.text()).length !== 1) return [];
    return [{ root, nodes: identifierReferences(rootNode, name.text(), [name]) }];
  }
}

/**
 * The declaration `identifier` resolves to, or null when the semantic
 * provider has none or cannot build it. Null is always safe for callers: it
 * means "unproven".
 */
export function definitionOf(identifier: SgNode<TSX>): DefinitionResult<TSX> | null {
  try {
    return identifier.definition();
  } catch {
    return null;
  }
}
