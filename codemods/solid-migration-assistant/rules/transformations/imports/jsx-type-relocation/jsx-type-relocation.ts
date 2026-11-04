import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";

export const JSX_TYPE_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#typescript-jsx-solid-js--renderer-package`;

export const SOLID_CORE_MODULE = "solid-js";
export const WEB_RENDERER_MODULE = "@solidjs/web";
const JSX_TYPE_NAME = "JSX";
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
 * Everything else is left to the read-only analyzer: mixed statements, value
 * imports (which cannot be `JSX`), `JSXElement` (gone in 2.0; use
 * `JSX.Element` from the renderer or `Element` from `solid-js`), namespace
 * imports, and `tsconfig.json`'s `jsxImportSource`, which is outside the
 * JavaScript and TypeScript surface this workflow scans.
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
    if (!isSoleJsxTypeImport(statement)) continue;
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
