import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { migrationGuide } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE = migrationGuide("attributes--events-closer-to-html-and-fewer-namespaces");

const NAMESPACE_PREFIXES = ["attr:", "bool:"] as const;

export function analyzeDomAttrNamespaces(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const findings: RuleFinding[] = [];
  for (const elementKind of ["jsx_opening_element", "jsx_self_closing_element"] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      for (const attribute of element
        .children()
        .filter((child) => child.kind() === "jsx_attribute")) {
        const nameNode = attribute
          .children()
          .find((child) => child.kind() === "jsx_namespace_name");
        if (!nameNode) continue;
        const name = nameNode.text();
        const prefix = NAMESPACE_PREFIXES.find((p) => name.startsWith(p));
        if (!prefix) continue;
        const start = nameNode.range().start;
        const bareName = name.slice(prefix.length);
        if (prefix === "attr:") {
          findings.push(
            finding(context.filename, start, {
        severity: "build",
        headline: `Migrate this attr: namespace attribute to a standard HTML attribute.`,
        why: `Solid 2 removes the attr: namespace; attributes use standard HTML behavior. The bare attribute name (${bareName}) replaces the namespaced form.`,
        guidance: `Remove the attr: prefix from this attribute, keeping the attribute value unchanged.`,
        guide: MIGRATION_GUIDE,
      }),
          );
        } else {
          findings.push(
            finding(context.filename, start, {
        severity: "build",
        headline: `Migrate this bool: namespace attribute to a standard HTML boolean attribute.`,
        why: `Solid 2 removes the bool: namespace; boolean attributes use standard HTML behavior. The bare attribute name (${bareName}) replaces the namespaced form.`,
        guidance: `Remove the bool: prefix. A standard HTML boolean attribute is true when present and false when absent — replace explicit true/false values with attribute presence/absence.`,
        guide: MIGRATION_GUIDE,
      }),
          );
        }
      }
    }
  }
  return findings;
}
