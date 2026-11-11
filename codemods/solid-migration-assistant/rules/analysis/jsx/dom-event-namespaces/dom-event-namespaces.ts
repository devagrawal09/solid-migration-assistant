import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE = migrationGuide("attributes--events-closer-to-html-and-fewer-namespaces");

const EVENT_PREFIXES = ["on:", "oncapture:"] as const;

export function analyzeDomEventNamespaces(
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
        const prefix = EVENT_PREFIXES.find((p) => name.startsWith(p));
        if (!prefix) continue;
        const start = nameNode.range().start;
        const eventName = name.slice(prefix.length);
        const isCapture = prefix === "oncapture:";
        const replacement = isCapture
          ? "a ref callback with { capture: true } on the native addEventListener"
          : "the appropriate camelCase event handler attribute (onClick, onInput, etc.)";
        findings.push(
          finding(context.filename, start, {
        severity: "build",
        headline: `Migrate this ${prefix}event namespace attribute to Solid 2 event handling.`,
        why: `Solid ${SOLID_TARGET_VERSION} removes the on: and oncapture: event namespaces (the compiler rejects them on native elements, and through a spread they become plain attributes); use camelCase event handler attributes or ref callbacks for native listener options.`,
        guidance: `Replace ${prefix}${eventName} with ${replacement}. Solid 2 events are camelCase only (onClick, never onclick, which is now a plain attribute); for capture-phase listeners, custom event names, or native options like passive/once, use a ref callback that calls addEventListener directly.`,
        guide: MIGRATION_GUIDE,
      }),
        );
      }
    }
  }
  return findings;
}
