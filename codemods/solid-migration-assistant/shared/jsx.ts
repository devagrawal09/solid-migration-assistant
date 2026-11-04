import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

/** One JSX attribute: the whole `jsx_attribute` node plus its name node. */
export type JsxAttribute = {
  node: SgNode<TSX>;
  /** A `property_identifier` or a `jsx_namespace_name`. */
  name: SgNode<TSX>;
};

/**
 * Intrinsic elements are the only elements whose attributes reach the DOM
 * renderer. A capitalized name, a member expression (`Components.Widget`),
 * and a namespaced name (`svg:circle`) are all excluded: components receive
 * their attributes as ordinary props that only their own body interprets, and
 * a namespaced element name is not the element syntax these rules reason
 * about.
 */
export function isIntrinsicElementName(
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
 * attribute list) can carry or override any attribute, a parse `ERROR` means
 * the source is malformed, and an attribute name node of any other kind is a
 * syntax these rules do not model.
 */
export function collectJsxAttributes(
  element: SgNode<TSX>,
): JsxAttribute[] | null {
  const attributes: JsxAttribute[] = [];

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
 * True when the attribute is written as `name={<one expression>}`. A
 * shorthand attribute (`<div name />`), a string value (`name="text"`), an
 * empty or comment-only container (`name={}`, `name={/* … *\/}`), and a
 * spread or sequence inside the container are all refused; a comment beside a
 * single expression is accepted and preserved.
 */
export function hasSingleExpressionValue(attribute: SgNode<TSX>): boolean {
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

/**
 * True when the attribute is written as `name="text"`: a plain string value
 * with no expression container.
 */
export function hasStringValue(attribute: SgNode<TSX>): boolean {
  const parts = attribute.children();
  if (parts.length !== 3) return false;
  const [, assign, value] = parts;
  return (
    assign !== undefined &&
    assign.kind() === "=" &&
    value !== undefined &&
    value.kind() === "string"
  );
}

/**
 * Source order for edits and report lines, by the start offset of each
 * element's own node.
 */
export function compareStart(left: SgNode<TSX>, right: SgNode<TSX>): number {
  return left.range().start.index - right.range().start.index;
}
