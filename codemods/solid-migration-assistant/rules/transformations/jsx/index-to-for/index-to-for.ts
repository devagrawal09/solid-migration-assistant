import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import {
  collectJsxAttributes,
  compareStart,
  hasSingleExpressionValue,
} from "../../../../shared/jsx.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";
import { rewrite, type RuleRewrite } from "../../../../shared/finding.ts";

export { SOLID_SOURCE_COMMIT } from "../../../../shared/target.ts";

export const INDEX_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#list-rendering-index-is-gone-and-for-handles-each-keying-mode`;

export const SOLID_CORE_MODULE = "solid-js";

const LEGACY_COMPONENT = "Index";
const REPLACEMENT_COMPONENT = "For";
const KEYED_ATTRIBUTE = "keyed={false}";

export type IndexRewrite = {
  edit: Edit;
  report: RuleRewrite;
};

/**
 * The automatic subset of the Solid 2 `Index` removal.
 *
 * Solid 1.x `Index` (`packages/solid/src/render/flow.ts` at `v1.9.13`) takes
 * `each`, an optional `fallback`, and a child callback
 * `(item: Accessor<T>, index: number) => U`, mapped through `indexArray`. Solid
 * 2.0.0-rc.21 removes `Index`; `For` in `packages/solid/src/client/flow.ts`
 * gains a `keyed` prop whose `false` overload takes the same `each`, the same
 * optional `fallback`, and the same child callback shape
 * `(item: Accessor<T[number]>, index: number) => U`, mapped through
 * `mapArray` with `keyed: false`, which `packages/signals/src/map.ts`
 * documents as "receives (item, index) where item is an accessor and index is
 * a stable number". The migration guide's list-rendering section prescribes
 * exactly this rewrite: `<Index each={…}>` becomes `<For keyed={false}
 * each={…}>` with the callback unchanged.
 *
 * This rule applies that rewrite to a file only when every `Index` and `For`
 * identifier in the file is accounted for, so the renamed import cannot change
 * the meaning of anything else:
 *
 * - the file has exactly one named, unaliased, non-type `Index` import from
 *   `solid-js`;
 * - every other `Index` identifier in the file is the name of a JSX element
 *   (opening, closing, or self-closing), never a value reference, a shorthand
 *   object property (`{ Index }`), a destructuring pattern, a type query, a
 *   parameter, or another declaration;
 * - every `For` identifier in the file is either the name of one named,
 *   unaliased, non-type `For` import from `solid-js` or the name of a JSX
 *   element; no `Index` or `For` type identifier exists; and
 * - every `<Index>` element carries only plainly named `each` and `fallback`
 *   attributes given as single-expression containers, with `each` present, no
 *   duplicate names, no spread attribute, no explicit type arguments
 *   (`<Index<T>>`), and (for an element with children) a closing `</Index>`
 *   tag.
 *
 * If any `<Index>` element in the file fails those checks, the whole file is
 * left unchanged: renaming the import while an element still reads `Index`
 * would break the file. Otherwise each opening or self-closing `Index` tag
 * becomes `For keyed={false}`, each closing tag becomes `For`, and the import
 * specifier is renamed to `For`, or removed (with one adjacent comma) when
 * `For` is already imported in the same statement. Attributes, children, the
 * callback, comments, and whitespace stay byte-identical.
 *
 * Everything else is left to the read-only analyzer, by design: aliased or
 * type-only imports, `Index` from `solid-js/web` or any other module, a sole
 * `Index` specifier while `For` is imported by a separate statement (removing
 * it would leave an empty import clause), named-import lists containing
 * comments, elements with `ref`, `children`, or `keyed` attributes, and any
 * element whose attributes do not parse cleanly.
 */
export function rewriteIndexToFor(
  rootNode: SgNode<TSX>,
  filename: string,
): IndexRewrite[] {
  const imports = solidNamedImports(rootNode);
  if (imports === null) return [];
  const { index: indexSpecifier, for: forSpecifier } = imports;
  if (indexSpecifier === null) return [];

  if (hasTypeIdentifier(rootNode, LEGACY_COMPONENT)) return [];
  if (hasTypeIdentifier(rootNode, REPLACEMENT_COMPONENT)) return [];

  const elements: SgNode<TSX>[] = [];
  for (const identifier of namedReferences(rootNode, LEGACY_COMPONENT)) {
    if (identifier.id() === indexSpecifier.field("name")!.id()) continue;
    const element = jsxElementNamedBy(identifier);
    if (element === null) return [];
    if (element.kind() !== "jsx_closing_element") elements.push(element);
  }
  for (const identifier of namedReferences(rootNode, REPLACEMENT_COMPONENT)) {
    if (forSpecifier !== null && identifier.id() === forSpecifier.field("name")!.id()) {
      continue;
    }
    if (jsxElementNamedBy(identifier) === null) return [];
  }

  const rewrites: { node: SgNode<TSX>; entry: IndexRewrite }[] = [];
  for (const element of elements) {
    const entries = rewriteElement(element, filename);
    if (entries === null) return [];
    rewrites.push(...entries);
  }

  const importRewrite = rewriteImport(indexSpecifier, forSpecifier, filename);
  if (importRewrite === null) return [];
  rewrites.push(importRewrite);

  return rewrites
    .sort((left, right) => compareStart(left.node, right.node))
    .map(({ entry }) => entry);
}

type NamedImports = {
  index: SgNode<TSX> | null;
  for: SgNode<TSX> | null;
};

/**
 * The file's single unaliased, non-type `Index` and `For` import specifiers
 * from `solid-js`, or null when either name is imported from `solid-js` more
 * than once, aliased, or type-only.
 */
function solidNamedImports(rootNode: SgNode<TSX>): NamedImports | null {
  const found: { index: SgNode<TSX>[]; for: SgNode<TSX>[] } = {
    index: [],
    for: [],
  };

  for (const statement of rootNode.findAll({
    rule: { kind: "import_statement" },
  })) {
    const source = statement.children().find((child) => child.is("string"));
    if (!source || stringLiteralValue(source) !== SOLID_CORE_MODULE) continue;
    const typeOnly = statement.children().some((child) => child.kind() === "type");

    for (const specifier of statement.findAll({
      rule: { kind: "import_specifier" },
    })) {
      const name = specifier.field("name");
      if (name === null || name.kind() !== "identifier") continue;
      const text = name.text();
      if (text !== LEGACY_COMPONENT && text !== REPLACEMENT_COMPONENT) continue;
      if (
        typeOnly ||
        specifier.field("alias") !== null ||
        specifier.children().some((child) => child.kind() === "type")
      ) {
        return null;
      }
      (text === LEGACY_COMPONENT ? found.index : found.for).push(specifier);
    }
  }

  if (found.index.length > 1 || found.for.length > 1) return null;
  return { index: found.index[0] ?? null, for: found.for[0] ?? null };
}

/**
 * Every node that can reference or bind `name` as a value: plain identifiers,
 * shorthand object properties (`{ Index }`), and shorthand destructuring
 * patterns (`const { Index } = …`). Member property names (`list.Index`) are
 * `property_identifier` nodes and never refer to the import.
 */
function namedReferences(rootNode: SgNode<TSX>, name: string): SgNode<TSX>[] {
  const kinds = [
    "identifier",
    "shorthand_property_identifier",
    "shorthand_property_identifier_pattern",
  ] as const;
  return kinds.flatMap((kind) =>
    rootNode.findAll({ rule: { kind, regex: `^${name}$` } }),
  );
}

function hasTypeIdentifier(rootNode: SgNode<TSX>, name: string): boolean {
  return (
    rootNode.findAll({ rule: { kind: "type_identifier", regex: `^${name}$` } })
      .length > 0
  );
}

/**
 * The JSX opening, closing, or self-closing element whose `name` field is
 * exactly this identifier, or null when the identifier is anything else.
 */
function jsxElementNamedBy(identifier: SgNode<TSX>): SgNode<TSX> | null {
  const parent = identifier.parent();
  if (parent === null) return null;
  const kind = parent.kind();
  if (
    kind !== "jsx_opening_element" &&
    kind !== "jsx_closing_element" &&
    kind !== "jsx_self_closing_element"
  ) {
    return null;
  }
  return parent.field("name")?.id() === identifier.id() ? parent : null;
}

function rewriteElement(
  element: SgNode<TSX>,
  filename: string,
): { node: SgNode<TSX>; entry: IndexRewrite }[] | null {
  if (element.children().some((child) => child.kind() === "type_arguments")) {
    return null;
  }
  const attributes = collectJsxAttributes(element);
  if (attributes === null) return null;

  const names = attributes.map(({ name }) =>
    name.kind() === "property_identifier" ? name.text() : null,
  );
  if (names.some((name) => name !== "each" && name !== "fallback")) return null;
  if (new Set(names).size !== names.length) return null;
  if (!names.includes("each")) return null;
  if (!attributes.every(({ node }) => hasSingleExpressionValue(node))) {
    return null;
  }

  const name = element.field("name")!;
  const start = element.range().start;
  const report = rewrite(filename, start, `Rewrite <${LEGACY_COMPONENT}> to <${REPLACEMENT_COMPONENT} ${KEYED_ATTRIBUTE}>, keeping its each, fallback, and child callback unchanged.`, INDEX_MIGRATION_GUIDE);
  const entries = [
    {
      node: element,
      entry: {
        edit: name.replace(`${REPLACEMENT_COMPONENT} ${KEYED_ATTRIBUTE}`),
        report,
      },
    },
  ];

  if (element.kind() === "jsx_opening_element") {
    const closing = element.parent()?.field("close_tag") ?? null;
    const closingName = closing?.field("name") ?? null;
    if (
      closing === null ||
      closingName === null ||
      closingName.kind() !== "identifier" ||
      closingName.text() !== LEGACY_COMPONENT
    ) {
      return null;
    }
    entries.push({
      node: closing,
      entry: { edit: closingName.replace(REPLACEMENT_COMPONENT), report },
    });
  }

  return entries;
}

/**
 * Renames the `Index` specifier to `For`, or removes it together with one
 * adjacent comma when the same statement already imports `For`. A sole
 * `Index` specifier whose `For` lives in another statement, and a named-import
 * list containing comments, are refused rather than reshaped.
 */
function rewriteImport(
  indexSpecifier: SgNode<TSX>,
  forSpecifier: SgNode<TSX> | null,
  filename: string,
): { node: SgNode<TSX>; entry: IndexRewrite } | null {
  const start = indexSpecifier.range().start;
  
  if (forSpecifier === null) {
    return {
      node: indexSpecifier,
      entry: {
        edit: indexSpecifier.field("name")!.replace(REPLACEMENT_COMPONENT),
        report: rewrite(filename, start, `Rewrite the ${LEGACY_COMPONENT} import from ${SOLID_CORE_MODULE} to ${REPLACEMENT_COMPONENT}.`, INDEX_MIGRATION_GUIDE),
      },
    };
  }

  const list = indexSpecifier.parent();
  if (list === null || list.kind() !== "named_imports") return null;
  if (forSpecifier.parent()?.id() !== list.id()) return null;
  const siblings = list.children();
  if (siblings.some((child) => child.kind() === "comment")) return null;
  const position = siblings.findIndex((child) => child.id() === indexSpecifier.id());
  if (position === -1) return null;

  const next = siblings[position + 1];
  const afterNext = siblings[position + 2];
  const previous = siblings[position - 1];
  const beforePrevious = siblings[position - 2];

  let startPos: number;
  let endPos: number;
  if (next?.kind() === "," && afterNext?.kind() === "import_specifier") {
    // `{ Index, For }` → drop the specifier, its comma, and the whitespace up
    // to the following specifier.
    startPos = indexSpecifier.range().start.index;
    endPos = afterNext.range().start.index;
  } else if (
    previous?.kind() === "," &&
    beforePrevious?.kind() === "import_specifier"
  ) {
    // `{ For, Index }` and `{ For, Index, }` → drop the preceding comma, the
    // whitespace, and the specifier.
    startPos = beforePrevious.range().end.index;
    endPos = indexSpecifier.range().end.index;
  } else {
    return null;
  }

  return {
    node: indexSpecifier,
    entry: {
      edit: { startPos, endPos, insertedText: "" },
      report: rewrite(filename, start, `Remove the ${LEGACY_COMPONENT} import from ${SOLID_CORE_MODULE}; ${REPLACEMENT_COMPONENT} is already imported.`, INDEX_MIGRATION_GUIDE),
    },
  };
}
