import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { BOOLEAN_ATTRIBUTE_GUIDE, booleanAttributeSites } from "../../../../shared/boolean-attributes.ts";
import { rewrite, type RuleRewrite } from "../../../../shared/finding.ts";

export { SOLID_SOURCE_COMMIT } from "../../../../shared/target.ts";

/**
 * Keeps Solid 1's "true"/"false" text on aria-*, data-* and enumerated
 * attributes (spellcheck, draggable, contenteditable, …) whose value is
 * known to be a boolean:
 *
 * - `aria-hidden={true}` becomes `aria-hidden="true"` (a container with a
 *   comment keeps it and gets `{"true"}`);
 * - an expression that always yields a boolean (`!open()`, a comparison, a
 *   ternary between true and false) becomes `String(expression)`.
 *
 * Both are exactly what Solid 1.9 rendered, in the DOM and in SSR. A value
 * that may not be a boolean (`aria-expanded={open()}`) is left to the
 * analyzer, since wrapping undefined would print "undefined" where 1.x
 * removed the attribute.
 */
export function rewriteBooleanAttributeValues(
  rootNode: SgNode<TSX>,
  filename: string,
): { edit: Edit; report: RuleRewrite }[] {
  return booleanAttributeSites(rootNode)
    .filter((site) => site.value.kind !== "unknown")
    .map((site) => {
      const expression = site.value.expression;
      const name = site.name.text();
      if (site.value.kind === "literal") {
        const text = JSON.stringify(expression.text().replace(/[()\s]/g, ""));
        return {
          edit: site.bare ? site.container.replace(text) : expression.replace(text),
          report: rewrite(filename, site.name, `Write ${name} on <${site.element}> as the string ${text}, which Solid 1 rendered and Solid 2 would turn into ${text === '"true"' ? "an empty value" : "a removed attribute"}.`, BOOLEAN_ATTRIBUTE_GUIDE),
        };
      }
      return {
        edit: expression.replace(`String(${expression.text()})`),
        report: rewrite(filename, site.name, `Wrap the boolean value of ${name} on <${site.element}> in String(), so it renders "true" or "false" as in Solid 1.`, BOOLEAN_ATTRIBUTE_GUIDE),
      };
    });
}
