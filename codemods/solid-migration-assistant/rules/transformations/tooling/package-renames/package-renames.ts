import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findModuleReferences, stringLiteralValue } from "../../../../shared/analysis.ts";
import { findBindings } from "../../../../shared/bindings.ts";
import { rewrite } from "../../../../shared/finding.ts";
import { migrationGuide } from "../../../../shared/target.ts";
import type { TransformChange } from "../../../../shared/transform.ts";

const IMPORTS_GUIDE = migrationGuide("imports-where-things-live-now");
const JSX_GUIDE = migrationGuide("typescript-jsx-solid-js--renderer-package");

/**
 * Packages that are the same package under a new name on Solid 2, as the
 * dependency table's `rename: true` entries that code imports. Migrate swaps
 * them in package.json (`shared/manifest.mjs`); this rule moves the imports
 * with them, so the config and tests keep resolving.
 *
 * - vite-plugin-solid 2.x is @solidjs/vite-plugin 3.x: its default export is
 *   still the plugin factory, and `solid()` with no options or with
 *   `include`, `exclude`, `dev`, `ssr` and `extensions` keeps its meaning;
 *   the options that changed are left to `tooling/build-config`.
 * - solid-testing-library is @solidjs/testing-library's old name.
 */
const RENAMED_PACKAGES: ReadonlyMap<string, string> = new Map([
  ["vite-plugin-solid", "@solidjs/vite-plugin"],
  ["solid-testing-library", "@solidjs/testing-library"],
]);

/**
 * Moves every module reference to a renamed package (static import,
 * re-export, dynamic `import()` and `require()` unless the file binds its own
 * `require`), keeping the import form and quote style.
 */
export function relocateRenamedPackages(rootNode: SgNode<TSX>, filename: string): TransformChange[] {
  const shadowedRequire = findBindings(rootNode, "require", { ignoreAmbient: true }).length > 0;
  const changes: TransformChange[] = [];
  for (const { source, moduleName, form } of findModuleReferences(rootNode)) {
    const replacement = RENAMED_PACKAGES.get(moduleName);
    if (replacement === undefined || (form === "require" && shadowedRequire)) continue;
    // `export default "vite-plugin-solid"` is a value, not a module source.
    if (form === "re-export" && !source.parent()?.children().some((child) => child.kind() === "from")) continue;
    const quote = source.text()[0];
    changes.push({
      edit: source.replace(`${quote}${replacement}${quote}`),
      report: rewrite(
        filename,
        source,
        moduleName === "vite-plugin-solid"
          ? "Import the Solid 2 Vite plugin from @solidjs/vite-plugin; its default export is still the plugin factory."
          : `Relocate ${moduleName} to ${replacement}, its current name.`,
        IMPORTS_GUIDE,
      ),
    });
  }
  return changes;
}

/**
 * Points a build tool's `jsxImportSource: "solid-js"` option (esbuild, tsup,
 * Vitest's esbuild settings) at @solidjs/web, the same edit migrate makes in
 * tsconfig.json. Only a plain property whose key is the identifier or string
 * `jsxImportSource` and whose value is the string "solid-js" is changed.
 */
export function rewriteJsxImportSourceOption(rootNode: SgNode<TSX>, filename: string): TransformChange[] {
  return rootNode.findAll({ rule: { kind: "pair" } }).flatMap((pair) => {
    const key = pair.field("key");
    const value = pair.field("value");
    if (key === null || value === null || !value.is("string") || stringLiteralValue(value) !== "solid-js") return [];
    const named = key.kind() === "property_identifier" ? key.text() === "jsxImportSource" : key.is("string") && stringLiteralValue(key) === "jsxImportSource";
    if (!named) return [];
    const quote = value.text()[0];
    return [{
      edit: value.replace(`${quote}@solidjs/web${quote}`),
      report: rewrite(filename, value, "Point this jsxImportSource option at @solidjs/web.", JSX_GUIDE),
    }];
  });
}
