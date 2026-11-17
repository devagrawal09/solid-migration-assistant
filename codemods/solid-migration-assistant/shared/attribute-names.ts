import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { booleanValue, isStringifiedAttribute } from "./boolean-attributes.ts";
import { isIntrinsicElementName } from "./jsx.ts";
import { migrationGuide } from "./target.ts";

export const ATTRIBUTE_NAMES_GUIDE = migrationGuide("attributes--events-closer-to-html-and-fewer-namespaces");

/**
 * React-style spellings Solid 1.9 accepted on native elements, with the
 * attribute each one set. The 1.9 compiler (babel-preset-solid 1.9.10)
 * lowercased every one of these in DOM and SSR output, aliased className
 * and htmlFor to class and for, and set readOnly as the readonly property.
 * The 2.0.0 JSX types declare only the lowercase names, and its compiler
 * passes the spelling through as written, so className renders a
 * "classname" attribute. acceptCharset and httpEquiv are left out: 1.9 set
 * "acceptcharset" and "httpequiv", so renaming them would change behavior.
 */
export const CAMEL_CASE_ATTRIBUTES: ReadonlyMap<string, string> = new Map([
  ["tabIndex", "tabindex"],
  ["readOnly", "readonly"],
  ["maxLength", "maxlength"],
  ["minLength", "minlength"],
  ["autoComplete", "autocomplete"],
  ["autoFocus", "autofocus"],
  ["autoCapitalize", "autocapitalize"],
  ["autoPlay", "autoplay"],
  ["contentEditable", "contenteditable"],
  ["crossOrigin", "crossorigin"],
  ["referrerPolicy", "referrerpolicy"],
  ["spellCheck", "spellcheck"],
  ["encType", "enctype"],
  ["formAction", "formaction"],
  ["formEncType", "formenctype"],
  ["formMethod", "formmethod"],
  ["formNoValidate", "formnovalidate"],
  ["formTarget", "formtarget"],
  ["noValidate", "novalidate"],
  ["accessKey", "accesskey"],
  ["colSpan", "colspan"],
  ["rowSpan", "rowspan"],
  ["dateTime", "datetime"],
  ["inputMode", "inputmode"],
  ["enterKeyHint", "enterkeyhint"],
  ["srcSet", "srcset"],
  ["useMap", "usemap"],
  ["allowFullScreen", "allowfullscreen"],
  ["playsInline", "playsinline"],
  ["noModule", "nomodule"],
  ["hrefLang", "hreflang"],
  ["charSet", "charset"],
  ["frameBorder", "frameborder"],
  ["popoverTarget", "popovertarget"],
  ["popoverTargetAction", "popovertargetaction"],
  ["fetchPriority", "fetchpriority"],
  ["itemProp", "itemprop"],
  ["itemScope", "itemscope"],
  ["itemType", "itemtype"],
  ["itemId", "itemid"],
  ["itemRef", "itemref"],
  ["className", "class"],
  ["htmlFor", "for"],
]);

/** HTML boolean attributes, which 1.9 set as properties (truthiness). */
const BOOLEAN_ATTRIBUTES = new Set(["readonly", "autofocus", "autoplay", "formnovalidate", "novalidate", "allowfullscreen", "playsinline", "nomodule", "itemscope"]);

export type AttributeNameSite = {
  element: string;
  name: SgNode<TSX>;
  target: string;
  /** Why the rename isn't provably the same, or null when it is. */
  refusal: string | null;
};

/**
 * Every camelCase attribute from the table on a native element (components
 * and custom elements are skipped), with the reason a rename would not be
 * equivalent:
 *
 * - the element already has the lowercase attribute;
 * - a boolean attribute (readonly) gets a value that may not be a boolean,
 *   since 1.9 set the property by truthiness and 2.0.0 removes it only for
 *   false, null and undefined (readOnly={0});
 * - any other attribute gets a boolean, which 1.9 printed as text and 2.0.0
 *   treats as presence (tabIndex={true}); contenteditable and spellcheck are
 *   the exception, since the boolean-values rule then keeps their text.
 */
export function attributeNameSites(rootNode: SgNode<TSX>): AttributeNameSite[] {
  const sites: AttributeNameSite[] = [];
  for (const elementKind of ["jsx_opening_element", "jsx_self_closing_element"] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      const elementName = element.field("name");
      if (!isIntrinsicElementName(elementName) || elementName.text().includes("-")) continue;
      const attributes = element.children().filter((child) => child.kind() === "jsx_attribute");
      const names = new Set(attributes.map((attribute) => attribute.children()[0]?.text()));
      for (const attribute of attributes) {
        const [name, , value] = attribute.children();
        if (name?.kind() !== "property_identifier") continue;
        const target = CAMEL_CASE_ATTRIBUTES.get(name.text());
        if (target === undefined) continue;
        sites.push({ element: elementName.text(), name, target, refusal: refusal(target, value, names) });
      }
    }
  }
  return sites.sort((left, right) => left.name.range().start.index - right.name.range().start.index);
}

function refusal(target: string, value: SgNode<TSX> | undefined, names: Set<string | undefined>): string | null {
  if (names.has(target)) return `the element already has ${target}`;
  if (value === undefined || value.kind() === "string") return null;
  const expressions = value.kind() === "jsx_expression"
    ? value.children().filter((child) => !["{", "}", "comment"].includes(child.kind()))
    : [];
  if (expressions.length !== 1) return "its value isn't a single expression";
  const kind = booleanValue(expressions[0]!)?.kind;
  if (BOOLEAN_ATTRIBUTES.has(target)) {
    return kind === "literal" || kind === "expression" ? null : `Solid 1 set ${target} by truthiness, and Solid 2 keeps it for any value but false, null and undefined`;
  }
  if ((kind === "literal" || kind === "expression") && !isStringifiedAttribute(target)) {
    return "Solid 1 printed a boolean value as text, and Solid 2 treats it as presence";
  }
  return null;
}
