import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";

export const JSX_TYPE_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#typescript-jsx-solid-js--renderer-package`;

export const SOLID_CORE_MODULE = "solid-js";
export const WEB_RENDERER_MODULE = "@solidjs/web";
const JSX_TYPE_NAME = "JSX";
const LEGACY_ELEMENT_ALIAS = "JSXElement";
const PRAGMA = /^(\/\*\*?[\s\S]*?@jsxImportSource\s+)solid-js(\s[\s\S]*?\*\/|\*\/)$/;

export type JsxTypeRelocation = {
  edit: Edit;
  report: string;
};

/**
 * The automatic subset of the Solid 2 "TypeScript JSX: solid-js → renderer
 * package" change.
 *
 * Solid 1.9.13 exported the `JSX` namespace from `solid-js`
 * (`packages/solid/src/index.ts`: `export type { JSXElement, JSX }`). At
 * 2.0.0-rc.21 `solid-js` exports no `JSX` at all; the renderer owns it:
 * `packages/web/src/index.ts` declares `export type { JSX } from
 * "../jsx/jsx.js"`. The migration guide prescribes the two rewrites this rule
 * applies, each a pure type-level relocation with no runtime semantics to
 * prove:
 *
 * - `import type { JSX } from "solid-js"` (or `import { type JSX } from
 *   "solid-js"`) becomes the same statement from `@solidjs/web`, but only when
 *   `JSX` is the statement's **only** specifier; a statement that also names
 *   `Component`, `Accessor`, or any other binding keeps those in `solid-js`,
 *   so it would have to be split, which this rule leaves to the analyzer.
 *   Aliases (`JSX as SolidJSX`) and quote style survive untouched.
 * - A `@jsxImportSource solid-js` pragma comment becomes
 *   `@jsxImportSource @solidjs/web`, because `solid-js` no longer ships the
 *   `jsx-runtime` type entries the pragma points TypeScript at. Only the exact
 *   token `solid-js` is rewritten; `@solidjs/h` or custom renderer sources are
 *   never touched.
 *
 * - A type-only `JSX` specifier inside a statement that also imports other
 *   `solid-js` bindings (`import type { JSX, Component } from "solid-js"` or
 *   `import { type JSX, createSignal } from "solid-js"`) is removed from that
 *   statement, with one adjacent comma, and re-imported on the next line as
 *   `import type { JSX } from "@solidjs/web"` (alias, quote style, and
 *   semicolon preserved), so every other binding stays in `solid-js`.
 * - `JSXElement`, which Solid 1.9.13 declared as `type JSXElement =
 *   JSX.Element` and which no Solid 2 package exports, is replaced by `JSX`
 *   from `@solidjs/web`, and each of its type references becomes
 *   `JSX.Element`. This applies only when the specifier is unaliased and
 *   type-only, every other `JSXElement` occurrence in the file is a type
 *   reference (never a value, an export, or a `typeof` query), `JSXElement`
 *   is bound nowhere else, and the file binds no `JSX` of its own, so the
 *   new name cannot collide.
 *
 * Every split requires a named-import list without comments, a single local
 * binding of the moved name in the file, and no import attributes. Everything
 * else is left to the read-only analyzer: value imports of `JSX` (a type
 * namespace), aliased or value `JSXElement` imports, `JSXElement` in a file
 * that already binds `JSX`, namespace imports, and `tsconfig.json`'s
 * `jsxImportSource`, which is outside the JavaScript and TypeScript surface
 * this workflow scans.
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
    if (!isSoleJsxTypeImport(statement)) {
      relocations.push(...splitStatement(rootNode, statement, source, filename));
      continue;
    }
    const start = source.range().start;
    const quote = source.text()[0];
    relocations.push({
      node: source,
      entry: {
        edit: source.replace(`${quote}${WEB_RENDERER_MODULE}${quote}`),
        report: `${filename}:${start.line + 1}:${start.column + 1} Relocate the JSX type import from ${SOLID_CORE_MODULE} to ${WEB_RENDERER_MODULE}. Official migration guide: ${JSX_TYPE_MIGRATION_GUIDE}`,
      },
    });
  }

  for (const comment of rootNode.findAll({ rule: { kind: "comment" } })) {
    const match = PRAGMA.exec(comment.text());
    if (match === null) continue;
    const start = comment.range().start;
    relocations.push({
      node: comment,
      entry: {
        edit: comment.replace(`${match[1]}${WEB_RENDERER_MODULE}${match[2]}`),
        report: `${filename}:${start.line + 1}:${start.column + 1} Rewrite the @jsxImportSource pragma from ${SOLID_CORE_MODULE} to ${WEB_RENDERER_MODULE}. Official migration guide: ${JSX_TYPE_MIGRATION_GUIDE}`,
      },
    });
  }

  return relocations
    .sort((left, right) => left.node.range().start.index - right.node.range().start.index)
    .map(({ entry }) => entry);
}

/**
 * True when the statement imports exactly one binding, `JSX`, as a type:
 * either `import type { JSX … }` or `import { type JSX … }`, with no default
 * or namespace clause, no other specifier, and no import attributes.
 */
function isSoleJsxTypeImport(statement: SgNode<TSX>): boolean {
  const statementTypeOnly = statement
    .children()
    .some((child) => child.kind() === "type");
  let clause: SgNode<TSX> | null = null;
  for (const child of statement.children()) {
    if (child.kind() === "import_attribute") return false;
    if (child.kind() === "import_clause") {
      if (clause !== null) return false;
      clause = child;
    }
  }
  if (clause === null) return false;

  let named: SgNode<TSX> | null = null;
  for (const child of clause.children()) {
    if (!child.isNamed() || child.kind() === "comment") continue;
    if (child.kind() !== "named_imports" || named !== null) return false;
    named = child;
  }
  if (named === null) return false;

  const specifiers = named
    .children()
    .filter((child) => child.isNamed() && child.kind() !== "comment");
  const specifier = specifiers.length === 1 ? specifiers[0] : undefined;
  if (specifier === undefined || specifier.kind() !== "import_specifier") {
    return false;
  }
  const name = specifier.field("name");
  if (name === null || name.kind() !== "identifier" || name.text() !== JSX_TYPE_NAME) {
    return false;
  }
  const specifierTypeOnly = specifier
    .children()
    .some((child) => child.kind() === "type");
  return statementTypeOnly || specifierTypeOnly;
}

/**
 * The split and `JSXElement` rewrites for a `solid-js` import statement that
 * is not a sole `JSX` type import. Returns no entries when the statement is
 * not a plain named-import list or nothing in it qualifies.
 */
function splitStatement(
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
  const typeOnly = (specifier: SgNode<TSX>) =>
    statementTypeOnly || specifier.children().some((child) => child.kind() === "type");
  const nameOf = (specifier: SgNode<TSX>) => specifier.field("name")?.text() ?? "";
  const localOf = (specifier: SgNode<TSX>) => (specifier.field("alias") ?? specifier.field("name"))?.text() ?? "";

  const quote = source.text()[0];
  const semicolon = statement.text().trimEnd().endsWith(";") ? ";" : "";
  const indent = " ".repeat(statement.range().start.column);
  const insertAt = statement.range().end.index;
  const entries: { node: SgNode<TSX>; entry: JsxTypeRelocation }[] = [];

  const jsx = specifiers.find((specifier) => nameOf(specifier) === JSX_TYPE_NAME);
  if (
    jsx !== undefined &&
    specifiers.length > 1 &&
    typeOnly(jsx) &&
    findBindings(rootNode, localOf(jsx)).length === 1
  ) {
    const removal = removeSpecifier(list, jsx);
    if (removal !== null) {
      const alias = jsx.field("alias");
      const imported = alias === null ? JSX_TYPE_NAME : `${JSX_TYPE_NAME} as ${alias.text()}`;
      const start = jsx.range().start;
      const report = `${filename}:${start.line + 1}:${start.column + 1} Move the JSX type specifier out of this ${SOLID_CORE_MODULE} import into a separate ${WEB_RENDERER_MODULE} type import. Official migration guide: ${JSX_TYPE_MIGRATION_GUIDE}`;
      entries.push(
        { node: jsx, entry: { edit: removal, report } },
        {
          node: jsx,
          entry: {
            edit: {
              startPos: insertAt,
              endPos: insertAt,
              insertedText: `\n${indent}import type { ${imported} } from ${quote}${WEB_RENDERER_MODULE}${quote}${semicolon}`,
            },
            report,
          },
        },
      );
    }
  }

  const element = specifiers.find((specifier) => nameOf(specifier) === LEGACY_ELEMENT_ALIAS);
  if (
    element !== undefined &&
    element.field("alias") === null &&
    typeOnly(element) &&
    findBindings(rootNode, LEGACY_ELEMENT_ALIAS).length === 1 &&
    findBindings(rootNode, JSX_TYPE_NAME).length === 0
  ) {
    const elementName = element.field("name")!;
    const values = rootNode
      .findAll({ rule: { kind: "identifier", regex: `^${LEGACY_ELEMENT_ALIAS}$` } })
      .filter((node) => node.id() !== elementName.id());
    const shorthand = rootNode.findAll({ rule: { kind: "shorthand_property_identifier", regex: `^${LEGACY_ELEMENT_ALIAS}$` } });
    const references = rootNode.findAll({ rule: { kind: "type_identifier", regex: `^${LEGACY_ELEMENT_ALIAS}$` } });
    if (values.length === 0 && shorthand.length === 0) {
      const start = element.range().start;
      const report = `${filename}:${start.line + 1}:${start.column + 1} Replace the JSXElement type import from ${SOLID_CORE_MODULE} with JSX from ${WEB_RENDERER_MODULE} and rewrite its ${references.length} type reference(s) to JSX.Element. Official migration guide: ${JSX_TYPE_MIGRATION_GUIDE}`;
      const edits: Edit[] = [];
      if (specifiers.length === 1) {
        edits.push(elementName.replace(JSX_TYPE_NAME), source.replace(`${quote}${WEB_RENDERER_MODULE}${quote}`));
      } else {
        const removal = removeSpecifier(list, element);
        if (removal !== null) {
          edits.push(removal, {
            startPos: insertAt,
            endPos: insertAt,
            insertedText: `\n${indent}import type { ${JSX_TYPE_NAME} } from ${quote}${WEB_RENDERER_MODULE}${quote}${semicolon}`,
          });
        }
      }
      if (edits.length > 0) {
        for (const reference of references) edits.push(reference.replace(`${JSX_TYPE_NAME}.Element`));
        for (const edit of edits) entries.push({ node: element, entry: { edit, report } });
      }
    }
  }

  return entries;
}

/**
 * Removes one specifier from a comment-free named-import list together with
 * one adjacent comma: the following one when another specifier follows,
 * otherwise the preceding one. Returns null when neither neighbor is a
 * specifier.
 */
function removeSpecifier(list: SgNode<TSX>, specifier: SgNode<TSX>): Edit | null {
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
