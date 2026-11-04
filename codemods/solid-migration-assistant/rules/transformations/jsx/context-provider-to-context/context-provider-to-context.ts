import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import {
  collectJsxAttributes,
  compareStart,
  hasSingleExpressionValue,
  hasStringValue,
} from "../../../../shared/jsx.ts";

export const SOLID_SOURCE_COMMIT =
  "2105ffb8ca2fced55f5fac0763177fc93f97c2c2";

export const CONTEXT_PROVIDER_MIGRATION_GUIDE = `https://github.com/solidjs/solid/blob/${SOLID_SOURCE_COMMIT}/documentation/solid-2.0/MIGRATION.md#context-providers-contextprovider--context-is-the-provider`;

export const SOLID_CORE_MODULE = "solid-js";

/**
 * One rule-owned edit plus the report line that documents it. An element
 * with a closing tag produces two edits (opening and closing name) that share
 * one report line; the workflow deduplicates report lines exactly, so the
 * site is reported once.
 */
export type ContextProviderRewrite = {
  edit: Edit;
  report: string;
};

/**
 * The automatic subset of the Solid 2 `Context.Provider` removal.
 *
 * In Solid 1.x, `createContext()` returned `{ id, Provider, defaultValue }`
 * and the provider component was reached through `.Provider`
 * (`packages/solid/src/reactive/signal.ts` at `v1.9.13`). In Solid
 * 2.0.0-rc.21, `createContext()` in `packages/solid/src/client/core.ts`
 * returns the provider function itself, carrying `id` and `defaultValue` as
 * properties, and no `Provider` property exists anywhere in the runtime:
 * `Context.Provider` evaluates to `undefined`, so `<Context.Provider>` cannot
 * render at all. The migration guide's "Context providers" section prescribes
 * exactly one rewrite: `<Theme.Provider value="dark">…</Theme.Provider>`
 * becomes `<Theme value="dark">…</Theme>`, with the `value` prop and the
 * children unchanged.
 *
 * That rewrite is what this rule applies, and only when the identifier in
 * front of `.Provider` is proven, inside the same file, to be a Solid context:
 *
 * - the file has exactly one named `createContext` import from `solid-js`
 *   (an alias is fine; `import type`, namespace imports, and any other module
 *   are not), and that local name is bound nowhere else in the file;
 * - the context name is declared exactly once in the file, as a `const`
 *   whose initializer is a direct call of that imported `createContext`, so
 *   no parameter, destructuring, loop variable, or nested declaration can
 *   shadow it where the JSX appears; and
 * - the element carries exactly one attribute, a plainly named `value` given
 *   either as a string or as an expression container holding exactly one
 *   expression, with no spread attribute and no other attribute.
 *
 * For an element with a closing tag, the closing tag must name the same
 * `Context.Provider`, and both tags are rewritten in the same pass. Only the
 * two name nodes change; attributes, children, comments, and whitespace stay
 * byte-identical.
 *
 * Everything else is left to the read-only analyzer, by design:
 *
 * - contexts imported from another module, created through a namespace
 *   import, created by a wrapper function, or created by another library's
 *   `createContext`, whose provider shape this rule cannot prove;
 * - contexts declared with `let` or `var`, declared more than once, or
 *   shadowed by any other binding of the same name;
 * - elements with a spread attribute, with no `value`, with a shorthand or
 *   empty `value`, or with any attribute besides `value`; and
 * - non-JSX uses of `.Provider`, such as `const P = Context.Provider`, which
 *   this rule neither rewrites nor treats as a reason to refuse the JSX sites.
 *
 * Solid 2 also treats `value={undefined}` as "no provider" (a default-less
 * context then throws `ContextNotFoundError`), where Solid 1.x fell through
 * to the default value. That is a runtime change of the migration itself, not
 * of this rewrite: the 1.x syntax has no working 2.0 form, and the migration
 * guide's own "Context" section documents the `undefined` rule for the
 * rewritten form.
 */
export function rewriteContextProvider(
  rootNode: SgNode<TSX>,
  filename: string,
): ContextProviderRewrite[] {
  const createContextLocal = solidCreateContextBinding(rootNode);
  if (createContextLocal === null) return [];

  const contexts = provenContextNames(rootNode, createContextLocal);
  if (contexts.size === 0) return [];

  const rewrites: { element: SgNode<TSX>; entries: ContextProviderRewrite[] }[] =
    [];

  for (const elementKind of [
    "jsx_opening_element",
    "jsx_self_closing_element",
  ] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      const entries = rewriteElement(element, contexts, filename);
      if (entries !== null) rewrites.push({ element, entries });
    }
  }

  return rewrites
    .sort((left, right) => compareStart(left.element, right.element))
    .flatMap(({ entries }) => entries);
}

/**
 * The local name of the file's single named `createContext` import from
 * `solid-js`, or null when there is no such import, more than one, a
 * type-only import, or any other binding of that local name in the file.
 */
function solidCreateContextBinding(rootNode: SgNode<TSX>): string | null {
  const locals: string[] = [];

  for (const statement of rootNode.findAll({
    rule: { kind: "import_statement" },
  })) {
    if (statement.children().some((child) => child.kind() === "type")) continue;
    const source = statement.children().find((child) => child.is("string"));
    if (!source || stringLiteralValue(source) !== SOLID_CORE_MODULE) continue;

    for (const specifier of statement.findAll({
      rule: { kind: "import_specifier" },
    })) {
      if (specifier.children().some((child) => child.kind() === "type")) {
        continue;
      }
      const name = specifier.field("name");
      if (name === null || name.kind() !== "identifier") continue;
      if (name.text() !== "createContext") continue;
      const alias = specifier.field("alias");
      locals.push(alias === null ? name.text() : alias.text());
    }
  }

  const local = locals.length === 1 ? locals[0] : undefined;
  if (local === undefined) return null;
  return findBindings(rootNode, local).length === 1 ? local : null;
}

/**
 * The names declared exactly once in the file as `const name = createContext(
 * … )` calls of the proven import, each with no other binding of that name
 * anywhere in the file.
 */
function provenContextNames(
  rootNode: SgNode<TSX>,
  createContextLocal: string,
): Set<string> {
  const names = new Set<string>();

  for (const declarator of rootNode.findAll({
    rule: { kind: "variable_declarator" },
  })) {
    const name = declarator.field("name");
    const value = declarator.field("value");
    if (name === null || name.kind() !== "identifier") continue;
    if (value === null || value.kind() !== "call_expression") continue;
    const callee = value.field("function");
    if (
      callee === null ||
      callee.kind() !== "identifier" ||
      callee.text() !== createContextLocal
    ) {
      continue;
    }
    const declaration = declarator.parent();
    if (
      declaration === null ||
      declaration.kind() !== "lexical_declaration" ||
      !declaration.children().some((child) => child.kind() === "const")
    ) {
      continue;
    }
    if (findBindings(rootNode, name.text()).length !== 1) continue;
    names.add(name.text());
  }

  return names;
}

function rewriteElement(
  element: SgNode<TSX>,
  contexts: ReadonlySet<string>,
  filename: string,
): ContextProviderRewrite[] | null {
  const contextName = providerContextName(element.field("name"), contexts);
  if (contextName === null) return null;
  if (!hasOnlyValueAttribute(element)) return null;

  const openingName = element.field("name")!;
  const edits: Edit[] = [openingName.replace(contextName)];

  if (element.kind() === "jsx_opening_element") {
    const closingName = element.parent()?.field("close_tag")?.field("name") ?? null;
    if (providerContextName(closingName, contexts) !== contextName) return null;
    edits.push(closingName!.replace(contextName));
  }

  const start = element.range().start;
  const report = `${filename}:${start.line + 1}:${start.column + 1} Rewrite <${contextName}.Provider> to <${contextName}>, keeping its value attribute and children unchanged. Official migration guide: ${CONTEXT_PROVIDER_MIGRATION_GUIDE}`;
  return edits.map((edit) => ({ edit, report }));
}

/**
 * The context name when the element name is exactly `<proven>.Provider`: a
 * member expression whose object is an identifier on the proven set and whose
 * property is the plain identifier `Provider`.
 */
function providerContextName(
  name: SgNode<TSX> | null,
  contexts: ReadonlySet<string>,
): string | null {
  if (name === null || name.kind() !== "member_expression") return null;
  const object = name.field("object");
  const property = name.field("property");
  if (object === null || object.kind() !== "identifier") return null;
  if (
    property === null ||
    property.kind() !== "property_identifier" ||
    property.text() !== "Provider"
  ) {
    return null;
  }
  return contexts.has(object.text()) ? object.text() : null;
}

/**
 * True when the element's complete attribute list is one plainly named
 * `value` attribute given as a string or as a single-expression container.
 */
function hasOnlyValueAttribute(element: SgNode<TSX>): boolean {
  const attributes = collectJsxAttributes(element);
  if (attributes === null || attributes.length !== 1) return false;
  const [attribute] = attributes;
  if (attribute === undefined) return false;
  if (
    attribute.name.kind() !== "property_identifier" ||
    attribute.name.text() !== "value"
  ) {
    return false;
  }
  return (
    hasSingleExpressionValue(attribute.node) || hasStringValue(attribute.node)
  );
}
