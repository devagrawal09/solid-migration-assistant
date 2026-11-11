import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findBindings } from "../../../../shared/bindings.ts";
import {
  collectJsxAttributes,
  compareStart,
  hasSingleExpressionValue,
} from "../../../../shared/jsx.ts";
import {
  namedImports,
  removeImportedSpecifier,
  type NamedImport,
} from "../../../../shared/imports.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";
import { rewrite, type RuleRewrite } from "../../../../shared/finding.ts";

export { SOLID_SOURCE_COMMIT } from "../../../../shared/target.ts";

export const SUSPENSE_LOADING_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#suspense--errorboundary--loading--errored`;

const LEGACY_COMPONENT = "Suspense";
const REPLACEMENT_COMPONENT = "Loading";
const SOLID_CORE_MODULE = "solid-js";
const SOLID_WEB_MODULE = "solid-js/web";

export type SuspenseLoadingRewrite = {
  edit: Edit;
  report: RuleRewrite;
};

/**
 * The automatic subset of the Solid 2 `Suspense` removal.
 *
 * Solid 1.9.13 (`packages/solid/src/render/Suspense.ts` at `v1.9.13`)
 * exports a `Suspense` component whose signature is
 * `Suspense(props: { fallback?: JSX.Element; children: JSX.Element })`;
 * the web runtime re-exports it in `packages/solid/web/src/index.ts` so
 * `import { Suspense } from "solid-js/web"` resolves to the same function.
 * Solid 2.0.0-rc.21 removes `Suspense` from both entry points (no export
 * named `Suspense` appears under `solid-js/package` or
 * `@solidjs/web/package` at the pinned commit) and replaces it with
 * `Loading`, declared by `packages/solid/src/client/flow.ts` (its emitted
 * type is `packages/solid/types/client/flow.d.ts` line 273) as
 * `Loading(props: { fallback?: SolidElement; on?: any; children: SolidElement })`
 * and re-exported from `@solidjs/web` at rc.21. `fallback` and `children`
 * stay the same JSX-element contract on both sides; the new `on` prop is
 * optional and defaults to tracking any read inside the subtree, exactly
 * the behavior Solid 1.x's `Suspense` had, so a `Suspense` element that
 * carries only an optional `fallback` renders the same subtree under
 * rc.21's `Loading`. The migration guide's "`Suspense` / `ErrorBoundary`
 * → `Loading` / `Errored`" section prescribes exactly this rename.
 *
 * This rule applies the rename to a file only when every `Suspense` and
 * `Loading` identifier in the file is accounted for, so the renamed import
 * cannot change the meaning of anything else:
 *
 * - the file has exactly one named, unaliased, non-type `Suspense` import
 *   whose module is `solid-js` or `solid-js/web`, and that local name is
 *   bound nowhere else in the file (so the shadowing discipline matches
 *   index-to-for);
 * - every `<Suspense>` element in the file is a JSX opening or
 *   self-closing element whose complete attribute list is at most one
 *   plainly named `fallback` attribute given as a single-expression
 *   container, with no spread and no other attribute; and a closing tag
 *   on a non-self-closing element must name the same `Suspense`;
 * - every `Loading` identifier in the file is either one named,
 *   unaliased, non-type `Loading` import from `solid-js` (so that
 *   dropping the `Suspense` specifier turns into "already imported") or
 *   the name of a JSX element; no type identifier named `Suspense` or
 *   `Loading` exists.
 *
 * If any `<Suspense>` element in the file fails those checks, the whole
 * file is left unchanged: renaming the import while an element still
 * reads `Suspense` would break the file. Otherwise:
 *
 * - every opening or self-closing `Suspense` tag becomes `Loading`, and
 *   every matching closing tag becomes `Loading`, attributes and
 *   children byte-identical;
 * - the `Suspense` import specifier is renamed to `Loading`, unless a
 *   `Loading` import from `solid-js` is already present in the file, in
 *   which case the `Suspense` specifier is removed (with one adjacent
 *   comma, or the whole statement when it was the sole specifier).
 *
 * `Suspense` from `solid-js/web` is accepted because Solid 1.9.13
 * re-exported the same function from that module; the rename still writes
 * `Loading` into the same statement, where the read-only
 * `imports/web-import` analyzer keeps reporting it so the user can move
 * it to `@solidjs/web` or `solid-js` (both of which export `Loading` in
 * rc.21). Everything else is left to the analyzer, by design: aliased
 * or type-only `Suspense`/`Loading` imports, `Suspense` from any other
 * module, elements with a spread, with a string `fallback`, with an
 * extra attribute, with explicit type arguments (`<Suspense<T>>`), with
 * an opening tag whose closing tag does not match, and files with
 * `Suspense` or `Loading` shadowed, declared, or referenced as anything
 * else.
 */
export function rewriteSuspenseToLoading(
  rootNode: SgNode<TSX>,
  filename: string,
): SuspenseLoadingRewrite[] {
  if (hasTypeIdentifier(rootNode, LEGACY_COMPONENT)) return [];
  if (hasTypeIdentifier(rootNode, REPLACEMENT_COMPONENT)) return [];

  const suspenseImport = findSingleNonTypeImport(rootNode, LEGACY_COMPONENT, [
    SOLID_CORE_MODULE,
    SOLID_WEB_MODULE,
  ]);
  if (suspenseImport === null) return [];
  if (findBindings(rootNode, LEGACY_COMPONENT).length !== 1) return [];

  const loadingImport = findSingleNonTypeImport(rootNode, REPLACEMENT_COMPONENT, [
    SOLID_CORE_MODULE,
  ]);
  const loadingBindings = findBindings(rootNode, REPLACEMENT_COMPONENT);
  if (loadingImport === null) {
    if (loadingBindings.length !== 0) return [];
  } else {
    if (loadingBindings.length !== 1) return [];
  }
  for (const identifier of plainReferences(rootNode, REPLACEMENT_COMPONENT)) {
    if (loadingImport !== null && identifier.id() === loadingImport.specifier.field("name")!.id()) {
      continue;
    }
    if (jsxElementNamedBy(identifier) === null) return [];
  }

  const elements: SgNode<TSX>[] = [];
  for (const identifier of plainReferences(rootNode, LEGACY_COMPONENT)) {
    if (identifier.id() === suspenseImport.specifier.field("name")!.id()) continue;
    const element = jsxElementNamedBy(identifier);
    if (element === null) return [];
    if (element.kind() !== "jsx_closing_element") elements.push(element);
  }

  const rewrites: { node: SgNode<TSX>; entry: SuspenseLoadingRewrite }[] = [];
  for (const element of elements) {
    const entries = rewriteElement(element, filename);
    if (entries === null) return [];
    rewrites.push(...entries);
  }

  const importRewrite = rewriteImport(suspenseImport, loadingImport, filename);
  if (importRewrite === null) return [];
  rewrites.push(importRewrite);

  return rewrites
    .sort((left, right) => compareStart(left.node, right.node))
    .map(({ entry }) => entry);
}

function findSingleNonTypeImport(
  rootNode: SgNode<TSX>,
  name: string,
  modules: readonly string[],
): NamedImport | null {
  const matches: NamedImport[] = [];
  for (const module of modules) {
    for (const found of namedImports(rootNode, module, name)) {
      if (found.specifier.field("alias") !== null) return null;
      if (
        found.specifier
          .children()
          .some((child) => child.kind() === "type")
      ) {
        return null;
      }
      matches.push(found);
    }
  }
  if (matches.length !== 1) return null;
  return matches[0]!;
}

function hasTypeIdentifier(rootNode: SgNode<TSX>, name: string): boolean {
  return (
    rootNode.findAll({ rule: { kind: "type_identifier", regex: `^${name}$` } })
      .length > 0
  );
}

/**
 * Every node that can reference or bind `name` as a value: plain
 * identifiers, shorthand object properties (`{ Suspense }`), and
 * shorthand destructuring patterns (`const { Suspense } = …`). Member
 * property names (`list.Suspense`) are `property_identifier` nodes and
 * never refer to the import.
 */
function plainReferences(rootNode: SgNode<TSX>, name: string): SgNode<TSX>[] {
  const kinds = [
    "identifier",
    "shorthand_property_identifier",
    "shorthand_property_identifier_pattern",
  ] as const;
  return kinds.flatMap((kind) =>
    rootNode.findAll({ rule: { kind, regex: `^${name}$` } }),
  );
}

/**
 * The JSX opening, closing, or self-closing element whose `name` field
 * is exactly this identifier, or null when the identifier is anything
 * else.
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
): { node: SgNode<TSX>; entry: SuspenseLoadingRewrite }[] | null {
  if (element.children().some((child) => child.kind() === "type_arguments")) {
    return null;
  }
  const attributes = collectJsxAttributes(element);
  if (attributes === null) return null;
  if (attributes.length > 1) return null;
  if (attributes.length === 1) {
    const [attribute] = attributes;
    if (attribute === undefined) return null;
    if (
      attribute.name.kind() !== "property_identifier" ||
      attribute.name.text() !== "fallback"
    ) {
      return null;
    }
    if (!hasSingleExpressionValue(attribute.node)) return null;
  }

  const name = element.field("name")!;
  const start = element.range().start;
  const report = rewrite(
    filename,
    start,
    `Rewrite <${LEGACY_COMPONENT}> to <${REPLACEMENT_COMPONENT}>, keeping its fallback attribute and children unchanged.`,
    SUSPENSE_LOADING_MIGRATION_GUIDE,
  );
  const entries: { node: SgNode<TSX>; entry: SuspenseLoadingRewrite }[] = [
    { node: element, entry: { edit: name.replace(REPLACEMENT_COMPONENT), report } },
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
 * Renames the `Suspense` specifier to `Loading`, or removes it (and its
 * adjacent comma, or the whole statement when it was the sole specifier)
 * when `Loading` is already imported from `solid-js`.
 */
function rewriteImport(
  suspenseImport: NamedImport,
  loadingImport: NamedImport | null,
  filename: string,
): { node: SgNode<TSX>; entry: SuspenseLoadingRewrite } | null {
  const start = suspenseImport.specifier.range().start;
  const module = loadingImport === null
    ? sourceModule(suspenseImport.statement)
    : SOLID_CORE_MODULE;

  if (loadingImport === null) {
    return {
      node: suspenseImport.specifier,
      entry: {
        edit: suspenseImport.specifier.field("name")!.replace(REPLACEMENT_COMPONENT),
        report: rewrite(
          filename,
          start,
          `Rewrite the ${LEGACY_COMPONENT} import from ${module ?? SOLID_CORE_MODULE} to ${REPLACEMENT_COMPONENT}.`,
          SUSPENSE_LOADING_MIGRATION_GUIDE,
        ),
      },
    };
  }

  const edit = removeImportedSpecifier(suspenseImport.statement, suspenseImport.specifier);
  if (edit === null) return null;
  const sourceName = sourceModule(suspenseImport.statement) ?? SOLID_CORE_MODULE;
  return {
    node: suspenseImport.specifier,
    entry: {
      edit,
      report: rewrite(
        filename,
        start,
        `Remove the ${LEGACY_COMPONENT} import from ${sourceName}; ${REPLACEMENT_COMPONENT} is already imported.`,
        SUSPENSE_LOADING_MIGRATION_GUIDE,
      ),
    },
  };
}

function sourceModule(statement: SgNode<TSX>): string | null {
  const source = statement.children().find((child) => child.is("string"));
  if (source === undefined) return null;
  const text = source.text();
  if (text.length < 2) return null;
  const quote = text[0];
  if ((quote !== '"' && quote !== "'") || text[text.length - 1] !== quote) {
    return null;
  }
  return text.slice(1, -1);
}
