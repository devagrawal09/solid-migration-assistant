import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findModuleReferences } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";

export { SOLID_SOURCE_COMMIT } from "../../../../shared/target.ts";

export const TRANSFORM_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#imports-where-things-live-now`;

/**
 * The deterministic, semantics-preserving subset of the Solid 2 import-path
 * moves. Every entry is a pure package relocation: the module source changes
 * while imported bindings, import form, and quote style are preserved. No
 * entry here has a removed, renamed, or behaviorally changed export, so each
 * rewrite is safe without binding-level review.
 */
export const LEGACY_SUBPATH_RELOCATIONS: Readonly<Record<string, string>> = {
  "solid-js/h": "@solidjs/h",
  "solid-js/html": "@solidjs/html",
  "solid-js/universal": "@solidjs/universal",
  "solid-js/jsx-runtime": "@solidjs/web/jsx-runtime",
  "solid-js/jsx-dev-runtime": "@solidjs/web/jsx-dev-runtime",
};

export type SubpathRelocation = {
  edit: Edit;
  report: string;
};

/**
 * Looks up a relocation target using an own-property check. A plain
 * `LEGACY_SUBPATH_RELOCATIONS[moduleName]` read would traverse the object's
 * prototype chain, so bare specifiers such as "constructor", "toString", or
 * "__proto__" would resolve to inherited members and be rewritten into
 * garbage. Those specifiers are ordinary module names and must stay intact.
 */
function relocationTarget(moduleName: string): string | undefined {
  if (!Object.hasOwn(LEGACY_SUBPATH_RELOCATIONS, moduleName)) return undefined;
  return LEGACY_SUBPATH_RELOCATIONS[moduleName];
}

/**
 * Only the string that follows the `from` keyword is a re-export's module
 * source. `export default "solid-js/h"` also places a string directly under
 * `export_statement`, but that string is the exported value, not a module
 * reference, so it must never be rewritten.
 */
function isReExportSource(source: SgNode<TSX>): boolean {
  const statement = source.parent();
  if (!statement || statement.kind() !== "export_statement") return false;
  return statement.children().some((child) => child.kind() === "from");
}

/**
 * Bare `require(...)` calls are module references only when `require` is the
 * ambient CommonJS require. The transform workflow has no semantic provider,
 * so shadowing is detected syntactically: if the file declares its own
 * `require` binding anywhere (function/class declaration, variable,
 * destructuring pattern, parameter, import, catch parameter), every bare
 * `require(...)` call in that file is conservatively left untouched.
 * `declare const require` and `declare function require` describe the global
 * require and are exempted. Binding slots are matched position-precisely, so
 * `import { require as r }`, `function f(a = require)`, and
 * `const alias = require` never count as shadows.
 */
function hasShadowingRequireBinding(rootNode: SgNode<TSX>): boolean {
  return findBindings(rootNode, "require", { ignoreAmbient: true }).length > 0;
}

/**
 * Maps every legacy Solid subpath module reference in `rootNode` to a
 * deterministic edit plus a human-readable per-edit report. The caller
 * commits the edits and persists the reports; this rule performs no I/O.
 */
export function relocateLegacySubpaths(
  rootNode: SgNode<TSX>,
  filename: string,
): SubpathRelocation[] {
  const shadowedRequire = hasShadowingRequireBinding(rootNode);
  return findModuleReferences(rootNode)
    .map(({ source, moduleName, form }) => {
      const replacement = relocationTarget(moduleName);
      if (replacement === undefined) return null;
      if (form === "re-export" && !isReExportSource(source)) return null;
      if (form === "require" && shadowedRequire) return null;
      const start = source.range().start;
      const quote = source.text()[0];
      return {
        edit: source.replace(`${quote}${replacement}${quote}`),
        report: `${filename}:${start.line + 1}:${start.column + 1} Relocate ${moduleName} to ${replacement}. Official migration guide: ${TRANSFORM_MIGRATION_GUIDE}`,
      };
    })
    .filter(
      (entry): entry is SubpathRelocation => entry !== null,
    );
}
