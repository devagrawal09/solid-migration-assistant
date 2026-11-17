import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { ATTRIBUTE_NAMES_GUIDE, attributeNameSites } from "../../../../shared/attribute-names.ts";
import { rewrite, type RuleRewrite } from "../../../../shared/finding.ts";

export { SOLID_SOURCE_COMMIT } from "../../../../shared/target.ts";

/**
 * Renames React-style attribute spellings on native elements (tabIndex,
 * readOnly, className, htmlFor, …) to the lowercase attribute Solid 1.9
 * already set for them, which is the only spelling the 2.0.0 JSX types
 * declare. Only the name node changes. Sites where the rename wouldn't
 * render the same (see `attributeNameSites`) are left to the analyzer. This
 * rule runs before the boolean-values rule, which then keeps the "true" or
 * "false" text on a renamed spellcheck or contenteditable.
 */
export function rewriteAttributeNames(
  rootNode: SgNode<TSX>,
  filename: string,
): { edit: Edit; report: RuleRewrite }[] {
  return attributeNameSites(rootNode)
    .filter((site) => site.refusal === null)
    .map((site) => ({
      edit: site.name.replace(site.target),
      report: rewrite(filename, site.name, `Rename ${site.name.text()} on <${site.element}> to ${site.target}, the attribute Solid 1 set for it.`, ATTRIBUTE_NAMES_GUIDE),
    }));
}
