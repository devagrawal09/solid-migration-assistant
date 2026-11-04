import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findModuleReferences } from "../../../../shared/analysis.ts";
import type { ModuleReference } from "../../../../shared/analysis.ts";

const LEGACY_WEB_MODULE = "solid-js/web";
const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now";

const FORM_LABELS: Record<ModuleReference["form"], string> = {
  import: "static import",
  "re-export": "re-export",
  "dynamic-import": "dynamic import()",
  require: "require() call",
};

const FORM_GUIDANCE: Record<ModuleReference["form"], string> = {
  import:
    " Change only this static import's module source to @solidjs/web and preserve its import form and quote style.",
  "re-export":
    " Change only this re-export's module source to @solidjs/web and preserve its export form and quote style.",
  "dynamic-import":
    " Change only this dynamic import's module source to @solidjs/web and preserve its quote style.",
  require:
    " Change only this require call's module source to @solidjs/web and preserve its quote style.",
};

export function analyzeWebImport(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findModuleReferences(rootNode)
    .filter((ref) => ref.moduleName === LEGACY_WEB_MODULE)
    .map(({ source, form }) => {
      const start = source.range().start;
      return `${context.filename}:${start.line + 1}:${start.column + 1} Move this Solid web renderer ${FORM_LABELS[form]}.
Why: Solid 2 publishes the web renderer from @solidjs/web instead of the solid-js/web subpath.
Guidance:${FORM_GUIDANCE[form]} Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}`;
    });
}