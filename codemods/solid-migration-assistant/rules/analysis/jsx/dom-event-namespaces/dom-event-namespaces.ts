import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const MIGRATION_GUIDE = "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#attributes--events-closer-to-html-and-fewer-namespaces";

const EVENT_PREFIXES = ["on:", "oncapture:"] as const;

export function analyzeDomEventNamespaces(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  const findings: string[] = [];
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
          `${context.filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this ${prefix}event namespace attribute to Solid 2 event handling.
Why: Solid 2.0.0-rc.21 removes the on: and oncapture: event namespaces (the compiler rejects them on native elements, and through a spread they become plain attributes); use camelCase event handler attributes or ref callbacks for native listener options.
Guidance: Replace ${prefix}${eventName} with ${replacement}. Solid 2 events are camelCase only (onClick, never onclick, which is now a plain attribute); for capture-phase listeners, custom event names, or native options like passive/once, use a ref callback that calls addEventListener directly. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}`,
        );
      }
    }
  }
  return findings;
}
