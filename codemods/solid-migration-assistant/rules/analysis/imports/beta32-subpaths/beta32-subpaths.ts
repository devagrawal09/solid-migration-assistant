import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findModuleReferences } from "../../../../shared/analysis.ts";
import type { ModuleReference } from "../../../../shared/analysis.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { migrationGuide } from "../../../../shared/target.ts";

const BETA32_SUBPATH_REPLACEMENTS: Readonly<Record<string, string>> = {
  "solid-js/store": "solid-js",
  "solid-js/h": "@solidjs/h",
  "solid-js/html": "@solidjs/html",
  "solid-js/universal": "@solidjs/universal",
  "solid-js/jsx-runtime": "@solidjs/web/jsx-runtime",
  "solid-js/jsx-dev-runtime": "@solidjs/web/jsx-dev-runtime",
};
const MIGRATION_GUIDE =
  migrationGuide("imports-where-things-live-now");
const STORE_STOP_CONDITION =
  "Stop: do not blindly rewrite this source. The plain createStore setter in Solid 2 accepts only a draft callback, setStore(state => { ... }); 1.x path setters such as setStore(\"user\", \"name\", value) and object merges such as setStore({ count: 1 }) must become draft writes, reconcile(value, options) became reconcile(value, key), and unwrap, produce, createMutable, and modifyMutable are renamed or removed. Migrate those call sites first, then move the surviving store imports to solid-js.";

const FORM_LABELS: Record<ModuleReference["form"], string> = {
  import: "static import",
  "re-export": "re-export",
  "dynamic-import": "dynamic import()",
  require: "require() call",
};

const FORM_GUIDANCE: Record<ModuleReference["form"], string> = {
  import:
    "Change only this static import's module source and preserve its import form and quote style.",
  "re-export":
    "Change only this re-export's module source and preserve its export form and quote style.",
  "dynamic-import":
    "Change only this dynamic import's module source and preserve its quote style.",
  require:
    "Change only this require call's module source and preserve its quote style.",
};

export function analyzeBeta32SubpathImports(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findModuleReferences(rootNode)
    .map((ref) => {
      const replacementModule = BETA32_SUBPATH_REPLACEMENTS[ref.moduleName];
      return replacementModule !== undefined
        ? { ...ref, replacementModule }
        : null;
    })
    .filter(
      (
        site,
      ): site is ModuleReference & { replacementModule: string } =>
        site !== null,
    )
    .map(({ source, moduleName, replacementModule, form }) => {
      const start = source.range().start;
      const store = moduleName === "solid-js/store";
      return finding(context.filename, start, {
        severity: "build",
        headline: `Move this Solid 2 legacy subpath ${FORM_LABELS[form]}.`,
        why: `Solid 2 publishes ${moduleName} from ${replacementModule}.`,
        guidance: `${FORM_GUIDANCE[form]}${store ? ` ${STORE_STOP_CONDITION}` : ""}`,
        lint: store ? ["removed-api"] : [],
        guide: MIGRATION_GUIDE,
      });
    });
}