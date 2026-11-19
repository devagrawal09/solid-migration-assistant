import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { BOOLEAN_ATTRIBUTE_GUIDE, booleanAttributeSites } from "../../../../shared/boolean-attributes.ts";
import { SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

/**
 * Reports aria-*, data-* and true/false enumerated attributes (spellcheck,
 * draggable, contenteditable, …) on native elements whose value is or may be
 * a boolean. Solid 1 rendered a boolean there as the text "true" or "false";
 * Solid ${SOLID_TARGET_VERSION} renders true as an empty value and removes the
 * attribute for false, which flips spellcheck and draggable back to their
 * defaults, makes aria-hidden="" not hide anything, and breaks
 * [data-x="true"] selectors.
 *
 * A literal true or false on a component's aria-* or data-* prop is
 * reported for review too (lucide's <Icon aria-hidden={false} />): a
 * component usually spreads those props onto its element, where the same
 * change applies. The transform leaves components alone.
 */
export function analyzeBooleanAttributeValues(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const forwarded: RuleFinding[] = [];
  for (const elementKind of ["jsx_opening_element", "jsx_self_closing_element"] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      // Components only: Capitalized or member names (namespaced and custom
      // elements are neither).
      const elementName = element.field("name");
      if (elementName === null) continue;
      if (!(elementName.kind() === "member_expression" || (elementName.kind() === "identifier" && /^[A-Z]/.test(elementName.text())))) continue;
      for (const attribute of element.children().filter((child) => child.kind() === "jsx_attribute")) {
        const [name, assign, container] = attribute.children();
        if (name?.kind() !== "property_identifier" || assign?.kind() !== "=" || container?.kind() !== "jsx_expression") continue;
        if (!/^(aria|data)-/.test(name.text())) continue;
        const literal = container.children().filter((child) => child.kind() !== "{" && child.kind() !== "}");
        if (literal.length !== 1 || (literal[0]!.kind() !== "true" && literal[0]!.kind() !== "false")) continue;
        forwarded.push(finding(context.filename, name, {
          severity: "behavior",
          headline: `Check how this component renders ${name.text()}={${literal[0]!.text()}}.`,
          why: `Solid 1 rendered a boolean ${name.text()} as the text "true" or "false" on whatever element received it. Solid ${SOLID_TARGET_VERSION} renders true as an empty value and removes the attribute for false, so when ${elementName.text()} passes this prop on to an element, ${literal[0]!.text() === "false" ? `${name.text()}="false" disappears` : `${name.text()}="" no longer says true`}.`,
          guidance: `If the component spreads or forwards ${name.text()} to an element, pass the string: ${name.text()}="${literal[0]!.text()}". If the component reads it as a boolean prop, keep it.`,
          guide: BOOLEAN_ATTRIBUTE_GUIDE,
        }));
      }
    }
  }
  return [...forwarded, ...booleanAttributeSites(rootNode).map((site) => {
    const name = site.name.text();
    const certain = site.value.kind !== "unknown";
    return finding(context.filename, site.name, {
      severity: "behavior",
      headline: certain
        ? `Write the boolean value of ${name} as "true" or "false".`
        : `Check whether the value of ${name} can be a boolean.`,
      why: `Solid 1 rendered a boolean ${name} as the text "true" or "false". Solid ${SOLID_TARGET_VERSION} treats every boolean attribute value as presence: true renders ${name}="" and false removes it, so ${name.startsWith("aria-") ? `assistive technology reads ${name} as unset` : name.startsWith("data-") ? `selectors and dataset reads that expect "true" or "false" stop matching` : `the browser falls back to the attribute's default`}.`,
      guidance: certain
        ? `Write a literal as a string (${name}="true"), and wrap an expression in String() (${name}={String(!open())}). The transform makes this edit.`
        : `If the value can be a boolean, render it as text: ${name}={String(value())}, or value() ? "true" : "false". Keep it as is when it is already a string, or undefined to remove the attribute.`,
      guide: BOOLEAN_ATTRIBUTE_GUIDE,
    });
  })].sort((left, right) => left.line - right.line || left.column - right.column);
}
