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
 */
export function analyzeBooleanAttributeValues(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return booleanAttributeSites(rootNode).map((site) => {
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
  });
}
