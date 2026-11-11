import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findBindings } from "../../../../shared/bindings.ts";
import {
  collectJsxAttributes,
  compareStart,
  hasStringValue,
} from "../../../../shared/jsx.ts";
import {
  namedImports,
  removeImportedSpecifier,
  type NamedImport,
} from "../../../../shared/imports.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";
import { rewrite, type RuleRewrite } from "../../../../shared/finding.ts";

export { SOLID_SOURCE_COMMIT } from "../../../../shared/target.ts";

export const ERROR_BOUNDARY_ERRORED_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#suspense--errorboundary--loading--errored`;

const LEGACY_COMPONENT = "ErrorBoundary";
const REPLACEMENT_COMPONENT = "Errored";
const SOLID_CORE_MODULE = "solid-js";
const SOLID_WEB_MODULE = "solid-js/web";

export type ErrorBoundaryErroredRewrite = {
  edit: Edit;
  report: RuleRewrite;
};

/**
 * The automatic subset of the Solid 2 `ErrorBoundary` removal.
 *
 * Solid 1.9.13 (`packages/solid/src/render/flow.ts` line 273 at
 * `v1.9.13`) declares
 * `ErrorBoundary(props: { fallback: JSX.Element | ((err: any, reset: () => void) => JSX.Element); children })`,
 * and `packages/solid/web/src/index.ts` re-exports it, so
 * `import { ErrorBoundary } from "solid-js/web"` resolves to the same
 * function. Solid 2.0.0-rc.21 removes `ErrorBoundary` from both entry
 * points and replaces it with `Errored`, declared by
 * `packages/solid/src/client/flow.ts` (its emitted type is
 * `packages/solid/types/client/flow.d.ts` line 205) as
 * `Errored(props: { fallback: SolidElement | ((err: ErrorAccessor, reset: () => void) => SolidElement); children: SolidElement })`.
 * The non-function `fallback` contract is identical: the boundary swaps
 * its subtree for the provided JSX when an error is thrown. The function
 * `fallback` form, however, changes semantics: `err` was the raw error
 * value in Solid 1.x and is an accessor (`Accessor<unknown>`) in rc.21.
 * Renaming a function `fallback` that reads `err` directly would not be
 * equivalent, so this transform refuses it; the analyzer still reports
 * the site.
 *
 * This rule renames the component to `Errored` only when every
 * `<ErrorBoundary>` element in the file is unambiguously syntactically
 * safe, so the whole-file rewrite cannot change behavior anywhere:
 *
 * - the file has exactly one named, unaliased, non-type `ErrorBoundary`
 *   import whose module is `solid-js` or `solid-js/web`, and that local
 *   name is bound nowhere else in the file (same shadowing discipline as
 *   index-to-for);
 * - every `<ErrorBoundary>` element in the file is a JSX opening or
 *   self-closing element whose complete attribute list is one plainly
 *   named `fallback` attribute (required by the 1.x signature), with no
 *   spread and no other attribute; and a closing tag on a non-self-closing
 *   element must name the same `ErrorBoundary`;
 * - that `fallback` is either a plain string value (`fallback="oops"`)
 *   or an expression container `{<jsx element or fragment>}` — never an
 *   arrow function, a function expression, an identifier, a call, or any
 *   other expression that could evaluate to a function at runtime; and
 * - every `Errored` identifier in the file is either one named,
 *   unaliased, non-type `Errored` import from `solid-js` (so that
 *   dropping the `ErrorBoundary` specifier turns into "already imported")
 *   or the name of a JSX element; no type identifier named
 *   `ErrorBoundary` or `Errored` exists.
 *
 * If any element fails those checks, the whole file is left unchanged:
 * renaming the import while an element still reads `ErrorBoundary` would
 * break the file, and a function `fallback` next to a JSX one cannot be
 * split. Otherwise:
 *
 * - every opening or self-closing `ErrorBoundary` tag becomes `Errored`,
 *   and every matching closing tag becomes `Errored`, attributes and
 *   children byte-identical;
 * - the `ErrorBoundary` import specifier is renamed to `Errored`, unless
 *   an `Errored` import from `solid-js` is already present in the file,
 *   in which case the `ErrorBoundary` specifier is removed (with one
 *   adjacent comma, or the whole statement when it was the sole
 *   specifier).
 *
 * `ErrorBoundary` from `solid-js/web` is accepted because Solid 1.9.13
 * re-exported the same function from that module; the rename still
 * writes `Errored` into the same statement, where the read-only
 * `imports/web-import` analyzer keeps reporting it so the user can move
 * it to `@solidjs/web` or `solid-js` (both of which export `Errored` in
 * rc.21).
 *
 * Everything else is left to the analyzer, by design: aliased or
 * type-only `ErrorBoundary`/`Errored` imports, `ErrorBoundary` from any
 * other module, elements with a spread, with no `fallback`, with any
 * other attribute, or with a `fallback` whose value is a function
 * expression, an identifier, a call, or any other non-JSX, non-string
 * expression, and files with `ErrorBoundary` or `Errored` shadowed,
 * declared, or referenced as anything else.
 */
export function rewriteErrorBoundaryToErrored(
  rootNode: SgNode<TSX>,
  filename: string,
): ErrorBoundaryErroredRewrite[] {
  if (hasTypeIdentifier(rootNode, LEGACY_COMPONENT)) return [];
  if (hasTypeIdentifier(rootNode, REPLACEMENT_COMPONENT)) return [];

  const legacyImport = findSingleNonTypeImport(rootNode, LEGACY_COMPONENT, [
    SOLID_CORE_MODULE,
    SOLID_WEB_MODULE,
  ]);
  if (legacyImport === null) return [];
  if (findBindings(rootNode, LEGACY_COMPONENT).length !== 1) return [];

  const replacementImport = findSingleNonTypeImport(rootNode, REPLACEMENT_COMPONENT, [
    SOLID_CORE_MODULE,
  ]);
  const replacementBindings = findBindings(rootNode, REPLACEMENT_COMPONENT);
  if (replacementImport === null) {
    if (replacementBindings.length !== 0) return [];
  } else {
    if (replacementBindings.length !== 1) return [];
  }
  for (const identifier of plainReferences(rootNode, REPLACEMENT_COMPONENT)) {
    if (
      replacementImport !== null &&
      identifier.id() === replacementImport.specifier.field("name")!.id()
    ) {
      continue;
    }
    if (jsxElementNamedBy(identifier) === null) return [];
  }

  const elements: SgNode<TSX>[] = [];
  for (const identifier of plainReferences(rootNode, LEGACY_COMPONENT)) {
    if (identifier.id() === legacyImport.specifier.field("name")!.id()) continue;
    const element = jsxElementNamedBy(identifier);
    if (element === null) return [];
    if (element.kind() !== "jsx_closing_element") elements.push(element);
  }

  const rewrites: { node: SgNode<TSX>; entry: ErrorBoundaryErroredRewrite }[] = [];
  for (const element of elements) {
    const entries = rewriteElement(element, filename);
    if (entries === null) return [];
    rewrites.push(...entries);
  }

  const importRewrite = rewriteImport(legacyImport, replacementImport, filename);
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
): { node: SgNode<TSX>; entry: ErrorBoundaryErroredRewrite }[] | null {
  if (element.children().some((child) => child.kind() === "type_arguments")) {
    return null;
  }
  const attributes = collectJsxAttributes(element);
  if (attributes === null) return null;
  if (attributes.length !== 1) return null;
  const [attribute] = attributes;
  if (attribute === undefined) return null;
  if (
    attribute.name.kind() !== "property_identifier" ||
    attribute.name.text() !== "fallback"
  ) {
    return null;
  }
  if (!isProvablyNonFunctionFallbackValue(attribute.node)) return null;

  const name = element.field("name")!;
  const start = element.range().start;
  const report = rewrite(
    filename,
    start,
    `Rewrite <${LEGACY_COMPONENT}> to <${REPLACEMENT_COMPONENT}>, keeping its non-function fallback attribute and children unchanged.`,
    ERROR_BOUNDARY_ERRORED_MIGRATION_GUIDE,
  );
  const entries: { node: SgNode<TSX>; entry: ErrorBoundaryErroredRewrite }[] = [
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
 * True when the fallback attribute value is written in one of the two
 * forms the non-function 1.x contract allows: a plain string value
 * (`fallback="oops"`) or a `{<element-or-fragment>}` expression
 * container. Any other expression inside the container — an arrow
 * function, a function expression, an identifier, a call, a conditional,
 * a template literal, a member access — could evaluate to a function at
 * runtime, so this rule treats it as unsupported and leaves the whole
 * file to the analyzer.
 */
function isProvablyNonFunctionFallbackValue(attribute: SgNode<TSX>): boolean {
  if (hasStringValue(attribute)) return true;
  const parts = attribute.children();
  if (parts.length !== 3) return false;
  const [, assign, container] = parts;
  if (assign === undefined || assign.kind() !== "=") return false;
  if (container === undefined || container.kind() !== "jsx_expression") return false;

  const expressions = container
    .children()
    .filter(
      (child) =>
        child.kind() !== "{" &&
        child.kind() !== "}" &&
        child.kind() !== "comment",
    );
  const expression = expressions.length === 1 ? expressions[0] : undefined;
  if (expression === undefined) return false;
  const kind = expression.kind();
  return (
    kind === "jsx_element" ||
    kind === "jsx_self_closing_element" ||
    kind === "jsx_fragment"
  );
}

/**
 * Renames the `ErrorBoundary` specifier to `Errored`, or removes it (and
 * its adjacent comma, or the whole statement when it was the sole
 * specifier) when `Errored` is already imported from `solid-js`.
 */
function rewriteImport(
  legacyImport: NamedImport,
  replacementImport: NamedImport | null,
  filename: string,
): { node: SgNode<TSX>; entry: ErrorBoundaryErroredRewrite } | null {
  const start = legacyImport.specifier.range().start;
  const sourceName = sourceModule(legacyImport.statement) ?? SOLID_CORE_MODULE;

  if (replacementImport === null) {
    return {
      node: legacyImport.specifier,
      entry: {
        edit: legacyImport.specifier.field("name")!.replace(REPLACEMENT_COMPONENT),
        report: rewrite(
          filename,
          start,
          `Rewrite the ${LEGACY_COMPONENT} import from ${sourceName} to ${REPLACEMENT_COMPONENT}.`,
          ERROR_BOUNDARY_ERRORED_MIGRATION_GUIDE,
        ),
      },
    };
  }

  const edit = removeImportedSpecifier(legacyImport.statement, legacyImport.specifier);
  if (edit === null) return null;
  return {
    node: legacyImport.specifier,
    entry: {
      edit,
      report: rewrite(
        filename,
        start,
        `Remove the ${LEGACY_COMPONENT} import from ${sourceName}; ${REPLACEMENT_COMPONENT} is already imported.`,
        ERROR_BOUNDARY_ERRORED_MIGRATION_GUIDE,
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
