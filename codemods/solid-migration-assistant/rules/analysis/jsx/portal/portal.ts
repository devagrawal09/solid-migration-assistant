import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { namedImports } from "../../../../shared/imports.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("imports-where-things-live-now");
const REMOVED_PROPS = new Set(["ref", "useShadow", "isSVG"]);

/**
 * Reports `<Portal>` elements whose component is imported from solid-js/web.
 * Solid 1.9.13's Portal mounted its children inside a wrapper `<div>` (an
 * `<svg:g>` with isSVG, a shadow root with useShadow) and passed that
 * element to `ref`. 2.0.3's Portal (`@solidjs/web`, `portalImpl`) takes
 * only `mount` and `children`, inserts the children between text markers
 * directly in the mount node, and renders nothing on the server.
 *
 * Each removed prop is a build break (the props type rejects it); every
 * other Portal is reported once as a behavior change, for code and CSS that
 * found the content through the wrapper.
 */
export function analyzePortal(rootNode: SgNode<TSX>, context: { filename: string }): RuleFinding[] {
  const locals = new Set(namedImports(rootNode, "solid-js/web", "Portal").map((imported) => imported.local));
  if (locals.size === 0) return [];
  const findings: RuleFinding[] = [];
  for (const elementKind of ["jsx_opening_element", "jsx_self_closing_element"] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      if (!locals.has(element.field("name")?.text() ?? "")) continue;
      const removed = element
        .children()
        .filter((child) => child.kind() === "jsx_attribute")
        .map((attribute) => attribute.child(0))
        .filter((name): name is SgNode<TSX> => name !== null && name.kind() === "property_identifier" && REMOVED_PROPS.has(name.text()));
      for (const name of removed) {
        findings.push(finding(context.filename, name, {
          severity: "build",
          headline: `Remove ${name.text()} from this Portal; Solid 2's Portal takes only mount and children.`,
          why: name.text() === "ref"
            ? `Solid 1.x passed the Portal's wrapper <div> to ref. Solid ${SOLID_TARGET_VERSION}'s Portal has no wrapper element and no ref prop: it inserts its children directly into mount.`
            : `Solid ${SOLID_TARGET_VERSION}'s Portal has no ${name.text()} option; it inserts its children directly into mount${name.text() === "useShadow" ? " and attaches no shadow root" : ", so SVG content goes into an SVG mount as is"}.`,
          guidance: name.text() === "ref"
            ? "Put the ref on an element you render inside the Portal (wrap the children in your own <div ref={...}> if code needs one element), or pass mount an element you hold a ref to."
            : name.text() === "useShadow"
              ? "Create the shadow root yourself (host.attachShadow({ mode: \"open\" })) and pass it, or an element inside it, as mount."
              : "Pass an SVG element as mount and render SVG children; there is no wrapper <g> to opt into.",
          guide: MIGRATION_GUIDE,
        }));
      }
      if (removed.length > 0) continue;
      findings.push(finding(context.filename, element, {
        severity: "behavior",
        headline: "Check code and CSS that find this Portal's content through its wrapper <div>.",
        why: `Solid 1.x rendered a Portal's children inside a <div> it appended to mount. Solid ${SOLID_TARGET_VERSION}'s Portal (still imported from @solidjs/web) inserts the children directly into mount between empty text nodes, and renders nothing on the server, so mount.firstChild, #root > div selectors and styles on that div no longer match.`,
        guidance: "If anything relied on the wrapper, render your own element inside the Portal and target it. Async reads inside a Portal start on the client; give them their own <Loading> boundary.",
        guide: MIGRATION_GUIDE,
      }));
    }
  }
  return findings;
}
