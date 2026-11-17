import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { ATTRIBUTE_NAMES_GUIDE, attributeNameSites } from "../../../../shared/attribute-names.ts";
import { SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

/**
 * Reports React-style attribute spellings on native elements (tabIndex,
 * readOnly, className, htmlFor, …). Solid 1 set the lowercase attribute for
 * each; the Solid ${SOLID_TARGET_VERSION} JSX types declare only the lowercase
 * name, and its compiler passes the spelling through, so className and
 * htmlFor stop setting class and for.
 */
export function analyzeAttributeNames(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return attributeNameSites(rootNode).map((site) => {
    const name = site.name.text();
    return finding(context.filename, site.name, {
      severity: "build",
      headline: `Rename ${name} to ${site.target}.`,
      why: `Solid 1 set the ${site.target} attribute for ${name}. Solid ${SOLID_TARGET_VERSION} declares only ${site.target} in its JSX types, so ${name} is a type error, and it renders the name as written${site.target === "class" || site.target === "for" ? `, so ${site.target} is no longer set` : ""}.`,
      guidance: site.refusal === null
        ? `Rename the attribute to ${site.target} and keep its value. The transform makes this edit.`
        : `Rename the attribute to ${site.target}. The transform leaves this one because ${site.refusal}, so check the value too.`,
      guide: ATTRIBUTE_NAMES_GUIDE,
    });
  });
}
