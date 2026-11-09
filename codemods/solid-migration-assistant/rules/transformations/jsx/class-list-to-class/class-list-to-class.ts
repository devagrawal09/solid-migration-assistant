import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";
import { rewrite, type RuleRewrite } from "../../../../shared/finding.ts";

export { SOLID_SOURCE_COMMIT } from "../../../../shared/target.ts";

export const CLASS_LIST_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#classlist--class-objectarray-forms`;

/**
 * One rule-owned edit plus the report line that documents it. The merge case
 * produces two edits (the rewritten `class` attribute and the removed
 * `classList` attribute) that share one report line; the workflow
 * deduplicates report lines exactly, so the site is reported once.
 */
export type ClassListRewrite = {
  edit: Edit;
  report: RuleRewrite;
};

/**
 * The automatic subset of the Solid 2 `classList` removal.
 *
 * Solid 2 deletes the JSX `classList` attribute and folds its behavior into
 * `class`, which now accepts a string, an object whose truthy keys are applied
 * as class names, or an array of those (`documentation/solid-2.0/07-dom.md`,
 * "Enhanced class prop"). The upstream `next` implementation inspected at
 * commit 2105ffb8ca2fced55f5fac0763177fc93f97c2c2 applies an object-valued
 * `class` through `className()` in `packages/web/src/client.ts`, whose
 * `classListToObject()` helper skips falsy values, skips empty and "undefined"
 * keys, and splits whitespace inside a key — the same per-key toggling Solid
 * 1.x performed for `classList`. The Babel plugin decomposes an inline
 * `class={{ ... }}` object literal into per-property compiled output
 * (`packages/babel-plugin/src/dom/element.ts`), matching the 1.x `classList`
 * compilation, and `ssrClassName()` in `packages/web/src/server.ts` renders the
 * same tokens on the server. So on an element whose only class source is one
 * `classList` expression, renaming the attribute key to `class` and leaving the
 * expression untouched emits the same classes in Solid 2 that `classList`
 * emitted in Solid 1.x.
 *
 * That equality is what this rule rewrites, and nothing else. An element
 * qualifies only when all of the following hold:
 *
 * - the element is intrinsic: its name is a plain lowercase-initial identifier
 *   (`div`, `my-element`), never a component, a member component, or a
 *   namespaced element name;
 * - it carries exactly one attribute named `classList`, spelled as a plain
 *   attribute name (never `ns:classList`, `class-list`, or `classlist`);
 * - that attribute's value is an expression container holding exactly one
 *   expression (comments inside the container are allowed and preserved);
 * - the element carries no other class source: no `class` or `className` in
 *   any namespace (`attr:class`, `prop:className`, `bool:class`) and no
 *   `class:`-namespaced toggle; and
 * - the element carries no spread attribute anywhere, since a spread can
 *   supply or override `class` and its position decides precedence.
 *
 * A second, narrower case merges a literal `class` string with a `classList`
 * object literal into the array form the migration guide shows:
 * `<div class="card" classList={{ active: isActive() }} />` becomes
 * `<div class={["card", { active: isActive() }]} />`. Measured against the
 * pinned builds (`solid-js@1.9.13` with `babel-plugin-jsx-dom-expressions
 * @0.40.7` on one side, `@solidjs/web@2.0.0-rc.21` with
 * `@solidjs/babel-plugin@2.0.0-rc.21` on the other), the two forms emit the
 * same class tokens on the DOM and in SSR output **only while no object key
 * names a token of the static string**: 1.x toggles each key independently of
 * the template's static tokens, and 2.0's `classListToObject` adds truthy keys
 * to the string's tokens, so a disjoint key is added when truthy and removed
 * when it turns falsy in both versions. A colliding key diverges (1.x's DOM
 * runtime removes the static token on a falsy value, 2.0 keeps it), so the
 * merge is applied only when:
 *
 * - the `class` value is a plain string literal containing no backslash,
 *   ampersand, quote, or line break, so the same text is a JavaScript string
 *   with the same value (JSX strings decode entities and take no escapes);
 * - the `classList` value is an object literal whose every property is a
 *   plain `key: value` pair or shorthand with a string-literal or identifier
 *   key, with no computed key, spread, method, or getter; and
 * - no whitespace-separated token of any key equals a token of the string.
 *
 * The object literal text is copied byte-for-byte into the array, the static
 * string keeps its exact text, and the `classList` attribute is removed with
 * the whitespace that preceded it. Every other combination (an expression
 * `class`, an identifier or call `classList` beside a `class`, a colliding or
 * computed key) stays with the analyzer.
 *
 * The plain rename replaces only the attribute's name node, so the value
 * expression, its comments, whitespace, and every other attribute stay
 * byte-identical.
 */
export function rewriteClassListToClass(
  rootNode: SgNode<TSX>,
  filename: string,
): ClassListRewrite[] {
  const rewrites: ClassListRewrite[] = [];

  for (const elementKind of [
    "jsx_opening_element",
    "jsx_self_closing_element",
  ] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      const rewrite = rewriteElement(element, filename);
      if (rewrite !== null) rewrites.push(...rewrite);
    }
  }

  return rewrites.sort((left, right) => left.edit.startPos - right.edit.startPos);
}

type Attribute = {
  /** The whole `jsx_attribute` node. */
  node: SgNode<TSX>;
  /** Its name node: a `property_identifier` or a `jsx_namespace_name`. */
  name: SgNode<TSX>;
};

function rewriteElement(
  element: SgNode<TSX>,
  filename: string,
): ClassListRewrite[] | null {
  const elementName = element.field("name");
  if (!isIntrinsicElementName(elementName)) return null;

  const attributes = collectAttributes(element);
  if (attributes === null) return null;

  const targets = attributes.filter(
    ({ name }) =>
      name.kind() === "property_identifier" && name.text() === "classList",
  );
  const target = targets.length === 1 ? targets[0] : undefined;
  if (target === undefined) return null;
  if (!hasSingleExpressionValue(target.node)) return null;

  const otherClassSources = attributes.filter(
    (attribute) =>
      attribute !== target && isClassSourceName(attribute.name.text()),
  );
  if (otherClassSources.length === 1) {
    return mergeElement(element, attributes, target, otherClassSources[0]!, filename);
  }
  if (otherClassSources.length > 0) return null;

  const start = target.name.range().start;
  return [
    {
      edit: target.name.replace("class"),
      report: rewrite(filename, start, `Rewrite the classList attribute on <${elementName.text()}> to class, preserving its value expression.`, CLASS_LIST_MIGRATION_GUIDE),
    },
  ];
}

/**
 * The array-form merge described above: `class="static"` plus
 * `classList={{ … }}` with disjoint literal keys becomes
 * `class={["static", { … }]}` and the `classList` attribute is dropped.
 */
function mergeElement(
  element: SgNode<TSX>,
  attributes: Attribute[],
  target: Attribute,
  classAttribute: Attribute,
  filename: string,
): ClassListRewrite[] | null {
  if (
    classAttribute.name.kind() !== "property_identifier" ||
    classAttribute.name.text() !== "class"
  ) {
    return null;
  }
  const staticClass = plainStringValue(classAttribute.node);
  if (staticClass === null) return null;
  const object = objectLiteralValue(target.node);
  if (object === null) return null;
  const keys = literalObjectKeys(object);
  if (keys === null) return null;

  const staticTokens = new Set(staticClass.split(/\s+/).filter(Boolean));
  for (const key of keys) {
    const tokens = key.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || key === "undefined") return null;
    if (tokens.some((token) => staticTokens.has(token))) return null;
  }

  const siblings = element.children();
  const position = siblings.findIndex((child) => child.id() === target.node.id());
  const previous = siblings[position - 1];
  if (position < 1 || previous === undefined) return null;

  const start = classAttribute.name.range().start;
  const elementName = element.field("name")!;
  const report = rewrite(filename, start, `Merge the class and classList attributes on <${elementName.text()}> into the class array form, preserving the static string and the object literal.`, CLASS_LIST_MIGRATION_GUIDE);
  return [
    {
      edit: classAttribute.node.replace(`class={["${staticClass}", ${object.text()}]}`),
      report,
    },
    {
      edit: {
        startPos: previous.range().end.index,
        endPos: target.node.range().end.index,
        insertedText: "",
      },
      report,
    },
  ];
}

/**
 * The text of a plain JSX string attribute value when it is also a valid
 * JavaScript double-quoted string with the same value: no backslash (JSX
 * takes no escapes), no ampersand (JSX decodes entities), no quote characters,
 * and no line break.
 */
function plainStringValue(attribute: SgNode<TSX>): string | null {
  const parts = attribute.children();
  if (parts.length !== 3) return null;
  const [, assign, value] = parts;
  if (assign === undefined || assign.kind() !== "=") return null;
  if (value === undefined || value.kind() !== "string") return null;
  const text = value.text();
  if (text.length < 2 || text[0] !== '"' || text[text.length - 1] !== '"') return null;
  const inner = text.slice(1, -1);
  return /[\\&"'\r\n]/.test(inner) ? null : inner;
}

/** The `object` node of a `classList={{ … }}` container, else null. */
function objectLiteralValue(attribute: SgNode<TSX>): SgNode<TSX> | null {
  const container = attribute.children()[2];
  if (container === undefined || container.kind() !== "jsx_expression") return null;
  const expressions = container
    .children()
    .filter((child) => child.isNamed() && child.kind() !== "comment");
  const expression = expressions.length === 1 ? expressions[0] : undefined;
  return expression !== undefined && expression.kind() === "object" ? expression : null;
}

/**
 * The key text of every property when all are plain pairs or shorthand with
 * identifier or string-literal keys; null on a computed key, spread, method,
 * getter, setter, numeric key, or a string key that is not plain.
 */
function literalObjectKeys(object: SgNode<TSX>): string[] | null {
  const keys: string[] = [];
  for (const property of object.children()) {
    if (!property.isNamed() || property.kind() === "comment") continue;
    if (property.kind() === "shorthand_property_identifier") {
      keys.push(property.text());
      continue;
    }
    if (property.kind() !== "pair") return null;
    const key = property.field("key");
    if (key === null) return null;
    if (key.kind() === "property_identifier") {
      keys.push(key.text());
      continue;
    }
    if (key.kind() === "string") {
      const text = key.text();
      const inner = text.slice(1, -1);
      if (/[\\\r\n]/.test(inner)) return null;
      keys.push(inner);
      continue;
    }
    return null;
  }
  return keys;
}

/**
 * Intrinsic elements are the only elements whose `class` prop reaches the DOM
 * renderer. A capitalized name, a member expression (`Components.Widget`), and
 * a namespaced name (`svg:circle`) are all excluded: components receive
 * `classList` as an ordinary prop that only their own body interprets, and a
 * namespaced element name is not the element syntax this rewrite reasons about.
 */
function isIntrinsicElementName(
  name: SgNode<TSX> | null,
): name is SgNode<TSX> {
  return (
    name !== null &&
    name.kind() === "identifier" &&
    /^[a-z][A-Za-z0-9-]*$/.test(name.text())
  );
}

/**
 * The element's attributes, or null when the element is not fully understood:
 * a spread attribute (`{...props}`, parsed as a bare `jsx_expression` in the
 * attribute list) can carry or override `class`, a parse `ERROR` means the
 * source is malformed, and an attribute name node of any other kind is a
 * syntax this rule does not model.
 */
function collectAttributes(element: SgNode<TSX>): Attribute[] | null {
  const attributes: Attribute[] = [];

  for (const child of element.children()) {
    const kind = child.kind();
    if (kind === "jsx_expression" || kind === "ERROR") return null;
    if (kind !== "jsx_attribute") continue;

    const name = child.children()[0];
    if (
      name === undefined ||
      (name.kind() !== "property_identifier" &&
        name.kind() !== "jsx_namespace_name")
    ) {
      return null;
    }
    attributes.push({ node: child, name });
  }

  return attributes;
}

/**
 * True for every attribute name that also writes the element's class list, so
 * the rewrite can refuse elements with more than one class source. This covers
 * plain `class` and `className`, the same names under any Solid 1.x namespace
 * (`attr:class`, `bool:class`, `prop:className`), and `class:`-namespaced
 * single-class toggles.
 */
function isClassSourceName(text: string): boolean {
  const separator = text.indexOf(":");
  const namespace = separator === -1 ? "" : text.slice(0, separator);
  const local = separator === -1 ? text : text.slice(separator + 1);
  if (namespace === "class" || namespace === "classList") return true;
  return local === "class" || local === "className";
}

/**
 * True when the attribute is written as `classList={<one expression>}`. A
 * shorthand attribute (`<div classList />`), a string value
 * (`classList="active"`), an empty or comment-only container
 * (`classList={}`, `classList={/* … *\/}`), and a spread or sequence inside the
 * container are all refused; a comment beside a single expression is kept.
 */
function hasSingleExpressionValue(attribute: SgNode<TSX>): boolean {
  const parts = attribute.children();
  if (parts.length !== 3) return false;

  const [, assign, container] = parts;
  if (assign === undefined || assign.kind() !== "=") return false;
  if (container === undefined || container.kind() !== "jsx_expression") {
    return false;
  }

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
    kind !== "ERROR" && kind !== "spread_element" && kind !== "sequence_expression"
  );
}
