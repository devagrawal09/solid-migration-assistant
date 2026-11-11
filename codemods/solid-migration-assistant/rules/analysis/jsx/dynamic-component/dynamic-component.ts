import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { referencesOf } from "../../../../shared/semantic.ts";

const MIGRATION_GUIDE = migrationGuide("dynamic-components-createdynamic--dynamic--dynamic-factory");
const WEB_MODULES = new Set(["solid-js/web", "@solidjs/web"]);

/**
 * Reports JSX uses of `Dynamic` imported (unaliased) from `solid-js/web` or
 * `@solidjs/web`. The component still exists at rc.21 and keeps working, but
 * it is deprecated in favor of the `dynamic(source)` factory, which hoists
 * the tag memo instead of paying a merge, an omit, and a fresh factory per
 * instance. References are resolved by the workspace semantic provider.
 */
export function analyzeDynamicComponent(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const sites = new Map<string, { element: SgNode<TSX>; filename: string }>();
  for (const statement of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const source = statement.children().find((child) => child.is("string"));
    const moduleName = source ? stringLiteralValue(source) : null;
    if (moduleName === null || !WEB_MODULES.has(moduleName)) continue;
    for (const specifier of statement.findAll({ rule: { kind: "import_specifier" } })) {
      const name = specifier.field("name");
      if (name === null || name.text() !== "Dynamic" || specifier.field("alias") !== null) continue;
      for (const fileReferences of referencesOf(name)) {
        const filename = fileReferences.root.relativeFilename().replaceAll("\\", "/");
        for (const reference of fileReferences.nodes) {
          const element = reference.parent();
          if (
            element === null ||
            (element.kind() !== "jsx_opening_element" && element.kind() !== "jsx_self_closing_element") ||
            element.field("name")?.id() !== reference.id()
          ) {
            continue;
          }
          sites.set(`${filename}:${element.id()}`, { element, filename });
        }
      }
    }
  }
  return [...sites.values()]
    .sort((left, right) => {
      const a = left.element.range().start;
      const b = right.element.range().start;
      return left.filename.localeCompare(right.filename) || a.line - b.line || a.column - b.column;
    })
    .map(({ element, filename }) => {
      const start = element.range().start;
      return finding(filename, start, {
        severity: "deprecated",
        headline: `Replace this deprecated Dynamic element with a dynamic() factory.`,
        why: `Solid ${SOLID_TARGET_VERSION} keeps <Dynamic component={...}> working but deprecates it (no runtime warning): the tag travels in the props bag, so every instance pays a merge at the call site, an omit inside, and a fresh factory memo that a JSX wrapper cannot hoist.`,
        guidance: `Hoist const Tag = dynamic(() => <the component expression>) to the component body, or to the module for a constant tag, and render <Tag {...the remaining props} />; inside a For callback the callback body is the place to hoist. Keep Dynamic as is when the migration is staged and the deprecation is acceptable for now.`,
        guide: MIGRATION_GUIDE,
      });
    });
}
