import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { collectJsxAttributes, isIntrinsicElementName } from "./jsx.ts";
import { migrationGuide } from "./target.ts";

export const BOOLEAN_ATTRIBUTE_GUIDE = migrationGuide("attributes--events-closer-to-html-and-fewer-namespaces");

/**
 * Attributes whose value is the text "true" or "false" rather than presence:
 * every aria-* and data-* attribute plus the HTML enumerated attributes that
 * take true/false. Solid 1.9 set a boolean value on any of these as its text
 * (setAttribute(el, "aria-hidden", true) wrote aria-hidden="true", and SSR
 * printed the same); Solid 2.0.3 treats every boolean as presence, so
 * true writes an empty value and false removes the attribute. None of these
 * names is in Solid 1's boolean-attribute or property tables, so 1.x always
 * took the setAttribute path for them.
 */
const ENUMERATED = new Set(["spellcheck", "draggable", "contenteditable", "autocorrect", "writingsuggestions"]);

export function isStringifiedAttribute(name: string): boolean {
  return /^(aria|data)-[a-z0-9-]+$/.test(name) || ENUMERATED.has(name);
}

/**
 * The attributes among those whose values are true/false states, so a value
 * of unknown type is likely a boolean. Other aria-* and data-* attributes are
 * reported only when the value is plainly a boolean, since aria-label or
 * data-id usually holds text.
 */
const TRUE_FALSE_STATES = new Set([
  "aria-atomic", "aria-busy", "aria-checked", "aria-current", "aria-disabled", "aria-expanded",
  "aria-grabbed", "aria-hidden", "aria-invalid", "aria-modal", "aria-multiline",
  "aria-multiselectable", "aria-pressed", "aria-readonly", "aria-required", "aria-selected",
  ...ENUMERATED,
]);

const BOOLEAN_OPERATORS = new Set(["===", "!==", "==", "!=", "<", ">", "<=", ">=", "instanceof", "in"]);

/**
 * How the value expression is known to be a boolean: `literal` for true or
 * false, `expression` for an operator that always yields one (`!x`, a
 * comparison, a ternary between true and false), `unknown` for anything else
 * that isn't a string.
 */
export type BooleanValue = { kind: "literal" | "expression" | "unknown"; expression: SgNode<TSX> };

export function booleanValue(expression: SgNode<TSX>): BooleanValue | null {
  const inner = unwrap(expression);
  const kind = inner.kind();
  if (kind === "true" || kind === "false") return { kind: "literal", expression };
  if (kind === "string" || kind === "template_string" || kind === "number" || kind === "jsx_element") return null;
  if (alwaysBoolean(inner)) return { kind: "expression", expression };
  return { kind: "unknown", expression };
}

function alwaysBoolean(node: SgNode<TSX>): boolean {
  const kind = node.kind();
  if (kind === "true" || kind === "false") return true;
  if (kind === "unary_expression") return node.field("operator")?.text() === "!";
  if (kind === "binary_expression") return BOOLEAN_OPERATORS.has(node.field("operator")?.text() ?? "");
  if (kind === "ternary_expression") {
    const consequence = node.field("consequence");
    const alternative = node.field("alternative");
    return consequence !== null && alternative !== null && alwaysBoolean(unwrap(consequence)) && alwaysBoolean(unwrap(alternative));
  }
  if (kind === "parenthesized_expression") return alwaysBoolean(unwrap(node));
  return false;
}

function unwrap(node: SgNode<TSX>): SgNode<TSX> {
  let current = node;
  while (current.kind() === "parenthesized_expression") {
    const inner = current.children().find((child) => child.kind() !== "(" && child.kind() !== ")");
    if (inner === undefined) return current;
    current = inner;
  }
  return current;
}

export type BooleanAttributeSite = {
  element: string;
  name: SgNode<TSX>;
  container: SgNode<TSX>;
  value: BooleanValue;
  /** True when the container holds nothing but the expression (no comments). */
  bare: boolean;
};

/**
 * Every `name={expression}` on a native element (custom elements excluded,
 * since Solid may set their props as properties) where `name` takes
 * "true"/"false" text and the expression may be a boolean.
 */
export function booleanAttributeSites(rootNode: SgNode<TSX>): BooleanAttributeSite[] {
  const sites: BooleanAttributeSite[] = [];
  for (const elementKind of ["jsx_opening_element", "jsx_self_closing_element"] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      const elementName = element.field("name");
      if (!isIntrinsicElementName(elementName) || elementName.text().includes("-")) continue;
      for (const attribute of element.children().filter((child) => child.kind() === "jsx_attribute")) {
        const [name, assign, container] = attribute.children();
        if (name?.kind() !== "property_identifier" || assign?.kind() !== "=" || container?.kind() !== "jsx_expression") continue;
        if (!isStringifiedAttribute(name.text())) continue;
        const parts = container.children().filter((child) => child.kind() !== "{" && child.kind() !== "}");
        const expressions = parts.filter((child) => child.kind() !== "comment");
        if (expressions.length !== 1) continue;
        const value = booleanValue(expressions[0]!);
        if (value === null || (value.kind === "unknown" && !TRUE_FALSE_STATES.has(name.text()))) continue;
        sites.push({ element: elementName.text(), name, container, value, bare: parts.length === 1 });
      }
    }
  }
  return sites.sort((left, right) => left.name.range().start.index - right.name.range().start.index);
}
