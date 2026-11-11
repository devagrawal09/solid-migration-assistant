import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE = migrationGuide(
  "attributes--events-closer-to-html-and-fewer-namespaces",
);

/**
 * Reports camelCase HTML/SVG attribute names Solid 1.x accepted on intrinsic
 * JSX elements and the rc.21 JSX types no longer declare, forcing the writer
 * to the standard lowercase HTML spelling.
 *
 * The list was derived mechanically from the two type files by extracting
 * every `camelCaseName?:` or `camelCaseName:` key and keeping names present
 * in 1.9 (`solid-js@1.9.13/types/jsx.d.ts`, downloaded to
 * `/tmp/solid19/types/jsx.d.ts`) but absent at rc.21
 * (`/tmp/rc21/@solidjs_web/package/types/jsx.d.ts`), then filtering to names
 * whose lowercase form IS declared at rc.21, so a direct rename is the fix:
 *
 *   accessKey, autoCapitalize, colSpan, contentEditable, contextMenu,
 *   crossOrigin, dateTime, exportParts, formAction, formEnctype, formMethod,
 *   formNoValidate, formTarget, inputMode, isMap, itemId, itemProp, itemRef,
 *   itemScope, itemType, maxLength, mediaGroup, minLength, noModule,
 *   noValidate, popoverTarget, popoverTargetAction, readOnly, referrerPolicy,
 *   rowSpan, srcSet, tabIndex, useMap.
 *
 * Excluded:
 *
 * - event handlers (`on*`), which the dom-lowercase-events rule owns;
 * - `classList`, which the class-list rule owns (the rc.21 types also drop
 *   the lowercase form, so the fix is not a rename);
 * - `handleEvent`, which is a method of
 *   `JSX.EventHandlerWithOptions` rather than an element attribute; and
 * - any camelCase name the rc.21 types still declare.
 *
 * Each site is reported at `build` severity: the rc.21 types reject the
 * camelCase key against the HTML/SVG element interfaces, so `tsc` fails even
 * though the runtime would set it as a custom attribute. Only intrinsic
 * (lowercase-identifier) element names are considered: components receive
 * their props as arbitrary names their own body interprets, and namespaced
 * names are a different syntax.
 */
export function analyzeDomAttrCasing(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const findings: RuleFinding[] = [];
  for (const elementKind of ["jsx_opening_element", "jsx_self_closing_element"] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      if (!isIntrinsicElement(element)) continue;
      for (const attribute of element
        .children()
        .filter((child) => child.kind() === "jsx_attribute")) {
        const name = attribute
          .children()
          .find((child) => child.kind() === "property_identifier");
        if (name === null || name === undefined) continue;
        const camel = name.text();
        if (!REMOVED_CAMELCASE.has(camel)) continue;
        const lower = camel.toLowerCase();
        findings.push(
          finding(context.filename, name, {
            severity: "build",
            headline: `Rename this ${camel} attribute to ${lower}.`,
            why: `Solid ${SOLID_TARGET_VERSION}'s JSX types declare ${lower} on this intrinsic element and no longer declare the camelCase ${camel} alias that Solid 1.9.13's types accepted, so tsc rejects the attribute key at this site.`,
            guidance: `Rename ${camel} to ${lower} on this element. Keep the attribute value byte-identical: the runtime attribute name is the same HTML attribute, only the TypeScript property key changed. Stop and ask when the value expression was computed from a type that depended on the camelCase key (for example a mapped type keyed by this attribute name).`,
            guide: MIGRATION_GUIDE,
          }),
        );
      }
    }
  }
  return findings.sort(
    (left, right) =>
      left.line - right.line || left.column - right.column,
  );
}

const REMOVED_CAMELCASE = new Set<string>([
  "accessKey",
  "autoCapitalize",
  "colSpan",
  "contentEditable",
  "contextMenu",
  "crossOrigin",
  "dateTime",
  "exportParts",
  "formAction",
  "formEnctype",
  "formMethod",
  "formNoValidate",
  "formTarget",
  "inputMode",
  "isMap",
  "itemId",
  "itemProp",
  "itemRef",
  "itemScope",
  "itemType",
  "maxLength",
  "mediaGroup",
  "minLength",
  "noModule",
  "noValidate",
  "popoverTarget",
  "popoverTargetAction",
  "readOnly",
  "referrerPolicy",
  "rowSpan",
  "srcSet",
  "tabIndex",
  "useMap",
]);

function isIntrinsicElement(element: SgNode<TSX>): boolean {
  const name = element.field("name");
  return (
    name !== null &&
    name.kind() === "identifier" &&
    /^[a-z][A-Za-z0-9-]*$/.test(name.text())
  );
}
