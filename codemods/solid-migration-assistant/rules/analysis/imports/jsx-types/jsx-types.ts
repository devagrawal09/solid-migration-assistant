import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { stringLiteralValue } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("typescript-jsx-solid-js--renderer-package");
const MOVED_TYPES = new Set(["JSX", "JSXElement"]);

/**
 * Reports every import specifier that takes `JSX` or `JSXElement` from
 * `solid-js`, and every `@jsxImportSource solid-js` pragma. Solid 2 moves the
 * JSX namespace to the renderer package (`@solidjs/web` for web projects) and
 * removes the `JSXElement` alias.
 */
export function analyzeJsxTypeImports(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  const findings: string[] = [];

  for (const statement of rootNode.findAll({
    rule: { kind: "import_statement" },
  })) {
    const source = statement.children().find((child) => child.is("string"));
    if (!source || stringLiteralValue(source) !== "solid-js") continue;
    for (const specifier of statement.findAll({
      rule: { kind: "import_specifier" },
    })) {
      const name = specifier.field("name");
      if (name === null || name.kind() !== "identifier") continue;
      const text = name.text();
      if (!MOVED_TYPES.has(text)) continue;
      const start = specifier.range().start;
      const replacement =
        text === "JSX"
          ? "Move this specifier to a separate import type { JSX } from \"@solidjs/web\" statement (or set jsxImportSource to @solidjs/web and use the global JSX namespace), leaving every other solid-js binding in place."
          : "Replace JSXElement with JSX.Element from @solidjs/web, or with Element from solid-js for renderer-neutral component code.";
      findings.push(
        `${context.filename}:${start.line + 1}:${start.column + 1} Manual review required: move this ${text} type import off solid-js.
Why: Solid ${SOLID_TARGET_VERSION} no longer exports the JSX namespace or the JSXElement alias from solid-js; renderer packages own JSX types, and web projects import JSX from @solidjs/web.
Guidance: ${replacement} Also set compilerOptions.jsxImportSource to @solidjs/web in tsconfig.json, which this analyzer does not scan. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}`,
      );
    }
  }

  for (const comment of rootNode.findAll({ rule: { kind: "comment" } })) {
    if (!/@jsxImportSource\s+solid-js(?:\s|\*)/.test(comment.text())) continue;
    const start = comment.range().start;
    findings.push(
      `${context.filename}:${start.line + 1}:${start.column + 1} Manual review required: point this @jsxImportSource pragma at the renderer package.
Why: Solid ${SOLID_TARGET_VERSION} does not ship jsx-runtime type entries from solid-js; web JSX types come from @solidjs/web (hyperscript from @solidjs/h).
Guidance: Change the pragma to @jsxImportSource @solidjs/web for web components, and mirror the change in tsconfig.json's compilerOptions.jsxImportSource, which this analyzer does not scan. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}`,
    );
  }

  return findings;
}
