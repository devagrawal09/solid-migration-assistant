import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#attributes--events-closer-to-html-and-fewer-namespaces";

/**
 * Reports every plainly named lowercase `on*` attribute on an intrinsic JSX
 * element. Solid 1.x bound these as event handlers exactly like their
 * camelCase spellings; Solid 2.0.0-rc.21 treats them as plain attributes.
 * Components are skipped: on a component, `onclick` is an ordinary prop with
 * no compiler or runtime semantics.
 */
export function analyzeDomLowercaseEvents(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  const findings: string[] = [];
  for (const elementKind of [
    "jsx_opening_element",
    "jsx_self_closing_element",
  ] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      const elementName = element.field("name");
      if (
        !elementName ||
        elementName.kind() !== "identifier" ||
        !/^[a-z][A-Za-z0-9-]*$/.test(elementName.text())
      ) {
        continue;
      }
      for (const attribute of element
        .children()
        .filter((child) => child.kind() === "jsx_attribute")) {
        const nameNode = attribute.children()[0];
        if (!nameNode || nameNode.kind() !== "property_identifier") continue;
        const name = nameNode.text();
        if (!/^on[a-z]+$/.test(name)) continue;
        const start = nameNode.range().start;
        const eventName = name.slice(2);
        findings.push(
          `${context.filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this lowercase ${name} attribute to a camelCase event handler.
Why: Solid 2.0.0-rc.21 binds an event only for on followed by an uppercase letter; a lowercase ${name} on a native element is a plain attribute in the browser, in SSR output, and through spreads, so a function value is stringified into the attribute instead of listening for ${eventName} as Solid 1.x did.
Guidance: Rename ${name} to the camelCase handler spelled by Solid's JSX types (for example onClick, onDblClick, onPointerDown) and keep the handler expression unchanged. Keep a string value only if an HTML inline-handler attribute is intended. For a custom event name or native listener options, use a ref callback that calls addEventListener. Make and validate that edit yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when a spread attribute or another on-prefixed attribute on this element could bind the same event, or when the intended camelCase spelling is unclear. Official migration guide: ${MIGRATION_GUIDE}`,
        );
      }
    }
  }
  return findings;
}
