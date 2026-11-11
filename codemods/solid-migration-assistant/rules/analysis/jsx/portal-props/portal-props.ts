import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE = migrationGuide(
  "attributes--events-closer-to-html-and-fewer-namespaces",
);

const WEB_MODULES = new Set(["solid-js/web", "@solidjs/web"]);

/**
 * Reports `<Portal useShadow>`, `<Portal isSVG>`, and `<Portal ref=...>` sites
 * that stop typechecking at rc.21.
 *
 * In Solid 1.9 `Portal` from `solid-js/web`
 * (`/workspace/solid/packages/solid/web/src/index.ts` line 58) accepted
 * `mount`, `useShadow`, `isSVG`, `ref`, and `children`, and the runtime
 * implemented a shadow-root wrapper, an SVG `<g>` wrapper, and a ref to the
 * wrapper element. At rc.21 the `@solidjs/web` package types
 * (`/tmp/rc21/@solidjs_web/package/types/index.d.ts` line 78) declare:
 *
 *   export declare function Portal(props: {
 *     mount?: Element;
 *     children: JSX.Element;
 *   }): JSX.Element;
 *
 * The runtime implementation (`/tmp/rc21/@solidjs_web/package/dist/web.js`,
 * `function Portal(props)`) only reads `props.mount` and `props.children`;
 * any `useShadow`, `isSVG`, or `ref` prop is silently ignored at runtime but
 * the compiler rejects it against the typed signature.
 *
 * Reported at `build` severity per removed attribute, when Portal is a named
 * import from `solid-js/web` or `@solidjs/web` (an alias is tracked by its
 * local name), the local name is bound exactly once in the file (so a
 * shadowing redeclaration keeps the rule silent), and the attribute name is
 * `useShadow`, `isSVG`, or `ref`. Member-access names (`Web.Portal`) and
 * namespace imports are not followed. A spread attribute is not a plainly
 * named one of these three, so it is ignored.
 */
export function analyzePortalProps(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const localNames = new Set<string>();
  for (const statement of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    if (statement.children().some((child) => child.kind() === "type")) continue;
    const source = statement.children().find((child) => child.is("string"));
    const moduleName = source ? stringLiteralValue(source) : null;
    if (moduleName === null || !WEB_MODULES.has(moduleName)) continue;
    for (const specifier of statement.findAll({ rule: { kind: "import_specifier" } })) {
      if (specifier.children().some((child) => child.kind() === "type")) continue;
      const name = specifier.field("name");
      if (name === null || name.kind() !== "identifier" || name.text() !== "Portal") continue;
      const local = specifier.field("alias") ?? name;
      if (local.kind() !== "identifier") continue;
      if (findBindings(rootNode, local.text()).length !== 1) continue;
      localNames.add(local.text());
    }
  }
  if (localNames.size === 0) return [];

  const findings: RuleFinding[] = [];
  for (const elementKind of ["jsx_opening_element", "jsx_self_closing_element"] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      const nameField = element.field("name");
      if (nameField === null || nameField.kind() !== "identifier") continue;
      if (!localNames.has(nameField.text())) continue;
      for (const attribute of element.children().filter((child) => child.kind() === "jsx_attribute")) {
        const name = attribute
          .children()
          .find((child) => child.kind() === "property_identifier");
        if (name === null || name === undefined) continue;
        const attr = name.text();
        if (attr !== "useShadow" && attr !== "isSVG" && attr !== "ref") continue;
        findings.push(buildFinding(context.filename, name, attr));
      }
    }
  }
  return findings.sort(
    (left, right) =>
      left.line - right.line || left.column - right.column,
  );
}

function buildFinding(
  filename: string,
  nameNode: SgNode<TSX>,
  attribute: "useShadow" | "isSVG" | "ref",
): RuleFinding {
  const common = `Solid ${SOLID_TARGET_VERSION}'s @solidjs/web declares Portal as (props: { mount?: Element; children: JSX.Element }) and reads only props.mount and props.children at runtime, so the ${attribute} prop is a type error and has no effect even if the typecheck is skipped.`;
  switch (attribute) {
    case "useShadow":
      return finding(filename, nameNode, {
        severity: "build",
        headline: `Drop this Portal useShadow prop and host shadow content in a custom element.`,
        why: `${common} Solid 1.x created a container element (a <div> or SVG <g>) and attached a shadow root to it when useShadow was set; rc.21's Portal creates no wrapper and offers no shadow-root option.`,
        guidance: `Remove useShadow. If the portal content must live in a shadow root, render a custom element whose constructor attaches a shadow root and place the portal's children inside that element; the Portal's mount prop can target that element directly. Stop and ask when the shadow boundary is required for style isolation and no custom-element wrapper is available.`,
        guide: MIGRATION_GUIDE,
      });
    case "isSVG":
      return finding(filename, nameNode, {
        severity: "build",
        headline: `Drop this Portal isSVG prop and pass an SVG mount instead.`,
        why: `${common} Solid 1.x wrapped children in an SVG <g> element when isSVG was set; rc.21's Portal inserts children directly into the mount node and offers no namespace flag.`,
        guidance: `Remove isSVG. To render into an SVG context, pass an SVG element (or an existing <g>) as the mount prop, created or looked up by the consumer. Stop and ask when the portal must create its own SVG container and the caller cannot supply one.`,
        guide: MIGRATION_GUIDE,
      });
    case "ref":
      return finding(filename, nameNode, {
        severity: "build",
        headline: `Move this Portal ref onto the first child element.`,
        why: `${common} Solid 1.x exposed the generated container element through ref; rc.21's Portal creates no container element, so a ref on Portal has nothing to point at.`,
        guidance: `Remove ref from the Portal and put the ref on the first child element the portal renders (wrap the children in a single element if there was none), since the mount node is now caller-owned rather than Solid-created. Stop and ask when the ref consumer requires the container element identity Solid 1.x used to provide.`,
        guide: MIGRATION_GUIDE,
      });
  }
}
