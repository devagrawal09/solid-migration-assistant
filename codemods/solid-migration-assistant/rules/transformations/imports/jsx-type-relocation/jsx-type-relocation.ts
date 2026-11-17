import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";
import { rewrite, type RuleRewrite } from "../../../../shared/finding.ts";

export const JSX_TYPE_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#typescript-jsx-solid-js--renderer-package`;

export const SOLID_CORE_MODULE = "solid-js";
export const WEB_RENDERER_MODULE = "@solidjs/web";
const JSX_TYPE_NAME = "JSX";
/** Types Solid 2 moved from `solid-js` to the renderer. `@solidjs/web`'s
 * `ComponentProps` and `ValidComponent` also accept intrinsic tag names, which
 * the `solid-js` versions no longer do. */
const RENDERER_TYPES = new Set([JSX_TYPE_NAME, "ComponentProps", "ValidComponent"]);
const LEGACY_ELEMENT_ALIAS = "JSXElement";
const PRAGMA = /^(\/\*\*?[\s\S]*?@jsxImportSource\s+)solid-js(\s[\s\S]*?\*\/|\*\/)$/;

export type JsxTypeRelocation = {
  edit: Edit;
  report: RuleRewrite;
};

/**
 * The automatic subset of the Solid 2 "TypeScript JSX: solid-js → renderer
 * package" change.
 *
 * Solid 1.9.13 exported the `JSX` namespace from `solid-js`
 * (`packages/solid/src/index.ts`: `export type { JSXElement, JSX }`). At
 * 2.0.0 `solid-js` exports no `JSX` at all; the renderer owns it:
 * `packages/web/src/index.ts` declares `export type { JSX } from
 * "../jsx/jsx.js"`, and `solid-js`'s `ComponentProps` and `ValidComponent`
 * accept components only, while the `@solidjs/web` versions also accept
 * intrinsic tag names. Every rewrite here is type-level, with no runtime
 * semantics to prove:
 *
 * - `JSX`, `ComponentProps` and `ValidComponent` move to `@solidjs/web`. When
 *   they are a statement's only specifiers, its source string is rewritten;
 *   otherwise they are removed from it and re-imported on the next line as one
 *   `import type { … } from "@solidjs/web"` (aliases, quote style, and
 *   semicolon preserved). A specifier imported without `type` moves only when
 *   every use of its local name is a type reference or a qualified type's
 *   namespace (`JSX.Element`).
 * - `JSXElement`, which no Solid 2 package exports, becomes `JSX` from
 *   `@solidjs/web`, and each of its type references becomes `JSX.Element`,
 *   when the specifier is unaliased and type-only, every other `JSXElement`
 *   is a type reference, and the file binds no `JSX`.
 * - A `@jsxImportSource solid-js` pragma becomes `@jsxImportSource
 *   @solidjs/web`; only that exact token is rewritten.
 *
 * Every move requires a named-import list without comments or import
 * attributes, and a single local binding of the moved name. Everything else
 * is left to the read-only analyzer: value uses, `typeof` queries and
 * re-exports of a moved name, aliased or value `JSXElement` imports,
 * namespace and default imports, and `tsconfig.json`'s `jsxImportSource`.
 */
export function relocateJsxTypes(
  rootNode: SgNode<TSX>,
  filename: string,
): JsxTypeRelocation[] {
  const relocations: { node: SgNode<TSX>; entry: JsxTypeRelocation }[] = [];

  for (const statement of rootNode.findAll({
    rule: { kind: "import_statement" },
  })) {
    const source = statement.children().find((child) => child.is("string"));
    if (!source || stringLiteralValue(source) !== SOLID_CORE_MODULE) continue;
    relocations.push(...relocateStatement(rootNode, statement, source, filename));
  }

  for (const comment of rootNode.findAll({ rule: { kind: "comment" } })) {
    const match = PRAGMA.exec(comment.text());
    if (match === null) continue;
    const start = comment.range().start;
    relocations.push({
      node: comment,
      entry: {
        edit: comment.replace(`${match[1]}${WEB_RENDERER_MODULE}${match[2]}`),
        report: rewrite(filename, start, `Rewrite the @jsxImportSource pragma from ${SOLID_CORE_MODULE} to ${WEB_RENDERER_MODULE}.`, JSX_TYPE_MIGRATION_GUIDE),
      },
    });
  }

  return relocations
    .sort((left, right) => left.node.range().start.index - right.node.range().start.index)
    .map(({ entry }) => entry);
}

type Move = { specifier: SgNode<TSX>; imported: string; extra: Edit[] };

/**
 * The relocations for one `solid-js` import statement: every specifier in
 * `RENDERER_TYPES` (plus a qualifying `JSXElement`) moves to `@solidjs/web`.
 * When every specifier moves, the source string is rewritten in place;
 * otherwise the moved specifiers are removed and re-imported on the next line
 * as one `import type { … } from "@solidjs/web"`. Returns no entries when the
 * statement is not a plain, comment-free named-import list.
 */
function relocateStatement(
  rootNode: SgNode<TSX>,
  statement: SgNode<TSX>,
  source: SgNode<TSX>,
  filename: string,
): { node: SgNode<TSX>; entry: JsxTypeRelocation }[] {
  if (statement.children().some((child) => child.kind() === "import_attribute")) return [];
  const clauses = statement.children().filter((child) => child.kind() === "import_clause");
  if (clauses.length !== 1) return [];
  const clauseParts = clauses[0]!.children().filter((child) => child.isNamed() && child.kind() !== "comment");
  const list = clauseParts.length === 1 && clauseParts[0]!.kind() === "named_imports" ? clauseParts[0]! : null;
  if (list === null || list.children().some((child) => child.kind() === "comment")) return [];

  const statementTypeOnly = statement.children().some((child) => child.kind() === "type");
  const specifiers = list.children().filter((child) => child.kind() === "import_specifier");
  const nameOf = (specifier: SgNode<TSX>) => specifier.field("name")?.text() ?? "";
  const localOf = (specifier: SgNode<TSX>) => (specifier.field("alias") ?? specifier.field("name"))?.text() ?? "";
  const typeOnly = (specifier: SgNode<TSX>) =>
    statementTypeOnly ||
    specifier.children().some((child) => child.kind() === "type") ||
    onlyTypeUses(rootNode, specifier, localOf(specifier));

  const moves: Move[] = [];
  for (const specifier of specifiers) {
    const name = nameOf(specifier);
    if (RENDERER_TYPES.has(name)) {
      if (!typeOnly(specifier) || findBindings(rootNode, localOf(specifier)).length !== 1) continue;
      const alias = specifier.field("alias");
      moves.push({ specifier, imported: alias === null ? name : `${name} as ${alias.text()}`, extra: [] });
    } else if (name === LEGACY_ELEMENT_ALIAS) {
      const move = legacyElementMove(rootNode, specifier, specifiers, statementTypeOnly);
      if (move !== null) moves.push(move);
    }
  }
  if (moves.length === 0) return [];

  const quote = source.text()[0];
  const first = moves[0]!.specifier;
  const names = moves.map((move) => nameOf(move.specifier)).join(", ");
  const legacy = moves.find((move) => nameOf(move.specifier) === LEGACY_ELEMENT_ALIAS);
  const legacyNote = legacy === undefined ? "" : ` JSXElement becomes JSX, and its ${legacy.extra.length} type reference(s) become JSX.Element.`;
  const report = rewrite(filename, first.range().start, `Move ${names} from ${SOLID_CORE_MODULE} to ${WEB_RENDERER_MODULE}.${legacyNote}`, JSX_TYPE_MIGRATION_GUIDE);
  const edits: Edit[] = moves.flatMap((move) => move.extra);

  if (moves.length === specifiers.length) {
    edits.push(source.replace(`${quote}${WEB_RENDERER_MODULE}${quote}`));
    for (const move of moves) {
      if (nameOf(move.specifier) === LEGACY_ELEMENT_ALIAS) edits.push(move.specifier.field("name")!.replace(JSX_TYPE_NAME));
    }
  } else {
    const removals = removeSpecifiers(specifiers, new Set(moves.map((move) => move.specifier.id())));
    const semicolon = statement.text().trimEnd().endsWith(";") ? ";" : "";
    const indent = " ".repeat(statement.range().start.column);
    const insertAt = statement.range().end.index;
    const imported = [...new Set(moves.map((move) => move.imported))].join(", ");
    edits.push(...removals, {
      startPos: insertAt,
      endPos: insertAt,
      insertedText: `\n${indent}import type { ${imported} } from ${quote}${WEB_RENDERER_MODULE}${quote}${semicolon}`,
    });
  }
  return edits.map((edit) => ({ node: first, entry: { edit, report } }));
}

/**
 * `JSXElement`, which no Solid 2 package exports, becomes `JSX` from
 * `@solidjs/web`, with each type reference rewritten to `JSX.Element`. Only
 * an unaliased, type-only specifier whose name is used solely as a type
 * reference, in a file that binds no `JSX`, qualifies.
 */
function legacyElementMove(
  rootNode: SgNode<TSX>,
  element: SgNode<TSX>,
  specifiers: SgNode<TSX>[],
  statementTypeOnly: boolean,
): Move | null {
  const typeOnly = statementTypeOnly || element.children().some((child) => child.kind() === "type");
  if (element.field("alias") !== null || !typeOnly) return null;
  if (findBindings(rootNode, LEGACY_ELEMENT_ALIAS).length !== 1) return null;
  if (findBindings(rootNode, JSX_TYPE_NAME).length !== 0) return null;
  if (specifiers.some((specifier) => specifier.field("name")?.text() === JSX_TYPE_NAME)) return null;
  const elementName = element.field("name")!;
  const values = rootNode
    .findAll({ rule: { kind: "identifier", regex: `^${LEGACY_ELEMENT_ALIAS}$` } })
    .filter((node) => node.id() !== elementName.id());
  const shorthand = rootNode.findAll({ rule: { kind: "shorthand_property_identifier", regex: `^${LEGACY_ELEMENT_ALIAS}$` } });
  if (values.length > 0 || shorthand.length > 0) return null;
  const references = rootNode.findAll({ rule: { kind: "type_identifier", regex: `^${LEGACY_ELEMENT_ALIAS}$` } });
  return {
    specifier: element,
    imported: JSX_TYPE_NAME,
    extra: references.map((reference) => reference.replace(`${JSX_TYPE_NAME}.Element`)),
  };
}

/**
 * True when every other occurrence of `local` in the file is in a type
 * position: a type reference (`ComponentProps<"div">`) or the namespace of a
 * qualified type (`JSX.Element`). Another specifier's imported name
 * (`JSX as J`) is not a use. A value use, `typeof` query, re-export or
 * shorthand property keeps a value-imported specifier in place.
 */
function onlyTypeUses(rootNode: SgNode<TSX>, specifier: SgNode<TSX>, local: string): boolean {
  const own = (specifier.field("alias") ?? specifier.field("name"))!;
  const pattern = `^${local.replace(/[$]/g, "\\$")}$`;
  for (const kind of ["identifier", "shorthand_property_identifier"] as const) {
    for (const node of rootNode.findAll({ rule: { kind, regex: pattern } })) {
      if (node.id() === own.id()) continue;
      const parent = node.parent()?.kind();
      if (kind === "identifier" && (parent === "nested_type_identifier" || parent === "import_specifier")) continue;
      return false;
    }
  }
  return true;
}

/**
 * Removes the given specifiers from a comment-free named-import list that
 * keeps at least one specifier. Each removed specifier takes the following
 * comma with it; a run of removed specifiers at the end of the list instead
 * takes the comma after the last kept one, so no two removals overlap.
 */
function removeSpecifiers(specifiers: SgNode<TSX>[], removed: Set<number>): Edit[] {
  let lastKept = -1;
  specifiers.forEach((specifier, index) => {
    if (!removed.has(specifier.id())) lastKept = index;
  });
  const edits: Edit[] = [];
  for (let index = 0; index < lastKept; index++) {
    const specifier = specifiers[index]!;
    if (!removed.has(specifier.id())) continue;
    edits.push({ startPos: specifier.range().start.index, endPos: specifiers[index + 1]!.range().start.index, insertedText: "" });
  }
  if (lastKept < specifiers.length - 1) {
    edits.push({ startPos: specifiers[lastKept]!.range().end.index, endPos: specifiers[specifiers.length - 1]!.range().end.index, insertedText: "" });
  }
  return edits;
}

