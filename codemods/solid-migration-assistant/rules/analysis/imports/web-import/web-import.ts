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

/**
 * Names a Solid 1.9 app imports from `solid-js/web` that `@solidjs/web`
 * rc.21 does not export for application code, with each one's replacement
 * as the pinned migration guide gives it. Moving these with the module
 * source alone produces an import that does not resolve.
 */
const NOT_MOVED: Readonly<Record<string, string>> = {
  Suspense: "replace Suspense with Loading from solid-js",
  ErrorBoundary: "replace ErrorBoundary with Errored from solid-js",
  SuspenseList: "replace SuspenseList with Reveal from solid-js",
  mergeProps: "replace mergeProps with merge from solid-js after reviewing its undefined-value semantics",
  Index: "replace Index with For keyed={false} from solid-js",
  createDynamic: "replace createDynamic(source, props) with the dynamic(source) factory from @solidjs/web",
  renderToStringAsync: "replace renderToStringAsync(...) with await renderToStream(...) from @solidjs/web",
};

const UNLISTED_NAMES_CAUTION = `If this code reads ${list(Object.keys(NOT_MOVED), "or")} from the module, replace those first; @solidjs/web does not export them.`;

export function analyzeWebImport(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findModuleReferences(rootNode)
    .filter((ref) => ref.moduleName === LEGACY_WEB_MODULE)
    .map(({ source, form }) => {
      const start = source.range().start;
      const names = form === "import" || form === "re-export" ? namedBindings(source.parent()) : null;
      const notMoved = (names ?? []).filter((name) => Object.hasOwn(NOT_MOVED, name));
      const moved = (names ?? []).filter((name) => !Object.hasOwn(NOT_MOVED, name));
      return finding(context.filename, start, {
        severity: "build",
        headline: `Move this Solid web renderer ${FORM_LABELS[form]}.`,
        why: `Solid 2 publishes the web renderer from @solidjs/web instead of the solid-js/web subpath.`,
        guidance:
          notMoved.length > 0
            ? `Do not move ${list(notMoved, "and")} with the module source: ${notMoved.map((name) => NOT_MOVED[name]).join("; ")}. ${moved.length > 0 ? `Move only ${list(moved, "and")} to @solidjs/web, preserving aliases and quote style.` : "Nothing else in this statement moves to @solidjs/web."}`
            : `${FORM_GUIDANCE[form]}${names === null ? ` ${UNLISTED_NAMES_CAUTION}` : ""}`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      });
    });
}

/**
 * The source names a braced import or re-export takes from the module: none
 * for a side-effect import, and null for a shape that hides them (namespace,
 * default-only, `export *`).
 */
function namedBindings(statement: SgNode<TSX> | null): string[] | null {
  const clause = statement?.find({ rule: { any: [{ kind: "named_imports" }, { kind: "export_clause" }] } });
  if (clause) {
    return clause
      .children()
      .filter((child) => child.kind() === "import_specifier" || child.kind() === "export_specifier")
      .map((specifier) => specifier.field("name")?.text() ?? "");
  }
  const sideEffectOnly = statement?.kind() === "import_statement" && !statement.find({ rule: { kind: "import_clause" } });
  return sideEffectOnly ? [] : null;
}

function list(names: string[], conjunction: "and" | "or"): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${conjunction} ${names.at(-1)}`;
}
