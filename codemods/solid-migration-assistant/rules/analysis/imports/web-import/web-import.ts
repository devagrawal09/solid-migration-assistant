import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findModuleReferences } from "../../../../shared/analysis.ts";
import type { ModuleReference } from "../../../../shared/analysis.ts";
import { migrationGuide } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const LEGACY_WEB_MODULE = "solid-js/web";
const MIGRATION_GUIDE =
  migrationGuide("imports-where-things-live-now");

const FORM_LABELS: Record<ModuleReference["form"], string> = {
  import: "static import",
  "re-export": "re-export",
  "dynamic-import": "dynamic import()",
  require: "require() call",
};

const FORM_GUIDANCE: Record<ModuleReference["form"], string> = {
  import:
    "Change only this static import's module source to @solidjs/web and preserve its import form and quote style.",
  "re-export":
    "Change only this re-export's module source to @solidjs/web and preserve its export form and quote style.",
  "dynamic-import":
    "Change only this dynamic import's module source to @solidjs/web and preserve its quote style.",
  require:
    "Change only this require call's module source to @solidjs/web and preserve its quote style.",
};

export function analyzeWebImport(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findModuleReferences(rootNode)
    .filter((ref) => ref.moduleName === LEGACY_WEB_MODULE)
    .map(({ source, form }) => {
      const start = source.range().start;
      return finding(context.filename, start, {
        severity: "build",
        headline: `Move this Solid web renderer ${FORM_LABELS[form]}.`,
        why: `Solid 2 publishes the web renderer from @solidjs/web instead of the solid-js/web subpath.`,
        guidance: `${FORM_GUIDANCE[form]}`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      });
    });
}