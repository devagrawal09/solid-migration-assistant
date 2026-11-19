import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findModuleReferences, stringLiteralValue } from "../../../../shared/analysis.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { referencesOf } from "../../../../shared/semantic.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const IMPORTS_GUIDE = migrationGuide("imports-where-things-live-now");
const JSX_GUIDE = migrationGuide("typescript-jsx-solid-js--renderer-package");
const VITE_PLUGINS = ["vite-plugin-solid", "@solidjs/vite-plugin"];
/** Build plugins that compile with babel-preset-solid 1.x (dependency table, verified 2026-11-19). */
const SOLID_1_COMPILERS = ["esbuild-plugin-solid", "tsup-preset-solid", "rollup-preset-solid"];
const MOVED_SUBPATHS: ReadonlyMap<string, string> = new Map([
  ["solid-js/web", "@solidjs/web"],
  ["solid-js/store", "solid-js (stores are part of it)"],
  ["solid-js/h", "@solidjs/h"],
  ["solid-js/html", "@solidjs/html"],
  ["solid-js/universal", "@solidjs/universal"],
]);

/**
 * Reports what a project's build configuration (vite, vitest, rollup, tsup,
 * esbuild, babel configs) still says about Solid 1, which no source rule
 * sees:
 *
 * - an import of vite-plugin-solid, renamed @solidjs/vite-plugin (migrate
 *   rewrites it and swaps the package);
 * - options passed to that plugin's factory that changed in 3.x: `hot` is
 *   gone, `babel` needs @babel/core installed, and `solid.moduleName` and
 *   `solid.omitServerOnlyTemplates`;
 * - babel-preset-solid named as a preset (`"solid"` in a `presets` list, or
 *   its package name), which is a plugin on Solid 2;
 * - imports of esbuild, tsup and rollup plugins that compile with Solid 1's
 *   babel-preset-solid;
 * - `jsxImportSource: "solid-js"` (migrate rewrites it); and
 * - a module list (rollup `external`, Vite `optimizeDeps`, tsup
 *   `noExternal`) naming a Solid 1 subpath, so the Solid 2 package would be
 *   bundled instead of shared.
 *
 * The workflow runs it on the files named like build configs plus any file
 * that names one of these packages.
 */
export function analyzeBuildToolConfig(rootNode: SgNode<TSX>, context: { filename: string }): RuleFinding[] {
  const { filename } = context;
  const findings: RuleFinding[] = [];

  for (const { source, moduleName } of findModuleReferences(rootNode)) {
    if (moduleName === "vite-plugin-solid") {
      findings.push(finding(filename, source, {
        severity: "build",
        headline: "Import the Solid 2 Vite plugin from @solidjs/vite-plugin.",
        why: `vite-plugin-solid 2.x compiles JSX for Solid 1 and peers on solid-js ^1.7.2, so it won't install beside solid-js ${SOLID_TARGET_VERSION}. It was renamed @solidjs/vite-plugin; 3.0.1 is the Solid 2 release, needs Vite 8 or 9 and Node 22.12 or newer, and still exports the plugin factory as its default.`,
        guidance: "Change this import to @solidjs/vite-plugin and swap the package in package.json; migrate makes both edits. solid() with no options keeps working; the options that changed are reported at each call.",
        guide: IMPORTS_GUIDE,
      }));
    }
    if (SOLID_1_COMPILERS.includes(moduleName)) {
      findings.push(finding(filename, source, {
        severity: "build",
        headline: `Replace ${moduleName}, which compiles JSX for Solid 1.`,
        why: `${moduleName} runs babel-preset-solid 1.x, whose output imports solid-js/web and the Solid 1 runtime helpers, which Solid ${SOLID_TARGET_VERSION} doesn't have. No release of it targets Solid 2.`,
        guidance: "Build with @solidjs/vite-plugin (Vite library mode for a library), or keep this bundler and run @solidjs/babel-plugin@2.0.2 through its Babel hook with moduleName \"@solidjs/web\". Stop and ask before changing a published library's build output.",
        guide: IMPORTS_GUIDE,
      }));
    }
  }

  // Calls of the plugin factory, through its default import.
  for (const statement of rootNode.findAll({ rule: { kind: "import_statement" } })) {
    const source = statement.children().find((child) => child.is("string"));
    if (source === undefined || !VITE_PLUGINS.includes(stringLiteralValue(source) ?? "")) continue;
    const binding = statement.find({ rule: { kind: "identifier", inside: { kind: "import_clause", stopBy: "neighbor" } } });
    if (binding === null) continue;
    for (const { nodes } of referencesOf(binding)) {
      for (const reference of nodes) {
        const call = reference.parent();
        if (call?.kind() !== "call_expression" || call.field("function")?.id() !== reference.id()) continue;
        const options = call.field("arguments")?.children().find((child) => child.kind() === "object");
        if (options !== undefined) findings.push(...pluginOptionFindings(filename, options));
      }
    }
  }

  for (const pair of rootNode.findAll({ rule: { kind: "pair" } })) {
    const key = propertyName(pair);
    const value = pair.field("value");
    if (value === null) continue;
    if (key === "jsxImportSource" && value.is("string") && stringLiteralValue(value) === "solid-js") {
      findings.push(finding(filename, value, {
        severity: "build",
        headline: "Point this jsxImportSource option at @solidjs/web.",
        why: "Solid 2 no longer ships JSX runtime entries from solid-js; web projects take them from @solidjs/web, so a build tool that resolves JSX through solid-js fails to resolve solid-js/jsx-runtime.",
        guidance: 'Set it to "@solidjs/web", as in tsconfig.json; migrate makes this edit.',
        guide: JSX_GUIDE,
      }));
    }
    if (key === "presets" && value.kind() === "array") {
      for (const preset of value.children()) {
        const name = preset.kind() === "array" ? preset.children().find((child) => child.is("string")) : preset;
        if (name === undefined || !name.is("string")) continue;
        const text = stringLiteralValue(name);
        if (text !== "solid" && text !== "babel-preset-solid") continue;
        findings.push(finding(filename, name, {
          severity: "build",
          headline: "Replace the babel-preset-solid preset with the @solidjs/babel-plugin plugin.",
          why: `babel-preset-solid compiles JSX for Solid 1. Its Solid 2 successor, @solidjs/babel-plugin 2.0.2, is a Babel plugin, not a preset, so it goes in plugins, and it emits code for @solidjs/web.`,
          guidance: 'Remove this preset and add "@solidjs/babel-plugin" to plugins (carry over options such as generate and hydratable; moduleName now defaults to "@solidjs/web"), and swap the package in package.json; migrate swaps the package but not this config. Projects built with @solidjs/vite-plugin don\'t need a Babel preset for JSX at all.',
          guide: IMPORTS_GUIDE,
        }));
      }
    }
    if (value.kind() === "array") {
      for (const element of value.children()) {
        const moved = element.is("string") ? MOVED_SUBPATHS.get(stringLiteralValue(element) ?? "") : undefined;
        if (moved === undefined) continue;
        findings.push(finding(filename, element, {
          severity: "behavior",
          headline: `Update ${element.text()} in this module list to ${moved}.`,
          why: `Solid ${SOLID_TARGET_VERSION} has no ${stringLiteralValue(element)} module, so this entry no longer matches anything. A bundler external or dependency-optimizer list that misses the Solid 2 package bundles a second copy of the runtime, which breaks reactivity and context across the copies.`,
          guidance: `Replace the entry with ${moved}${moved.startsWith("solid-js") ? ", or remove it when solid-js is already listed" : ""}. A regular expression or a function that matches solid-js/ also needs @solidjs/ added.`,
          guide: IMPORTS_GUIDE,
        }));
      }
    }
  }
  return findings;
}

/** The changed options of one `solid({...})` call. */
function pluginOptionFindings(filename: string, options: SgNode<TSX>): RuleFinding[] {
  const findings: RuleFinding[] = [];
  for (const pair of options.children().filter((child) => child.kind() === "pair")) {
    const key = propertyName(pair);
    const value = pair.field("value");
    if (key === "hot") {
      findings.push(finding(filename, pair, {
        severity: "build",
        headline: "Remove the hot option; @solidjs/vite-plugin has none.",
        why: "vite-plugin-solid 2.x took hot to turn off solid-refresh. @solidjs/vite-plugin 3 replaces it with refresh, and its option types reject hot.",
        guidance: "Delete hot. If it was false, set refresh: false instead.",
        guide: IMPORTS_GUIDE,
      }));
    }
    if (key === "babel") {
      findings.push(finding(filename, pair, {
        severity: "build",
        headline: "Install @babel/core for this babel option, and check the plugins it adds.",
        why: "@solidjs/vite-plugin 3 compiles JSX with its native compiler and loads @babel/core only for the babel option, as an optional peer it doesn't install. Without it the build fails when the plugin first transforms a file; Babel plugins written against babel-preset-solid's Solid 1 output may also no longer apply.",
        guidance: "Add @babel/core to devDependencies, or drop the option when it only configured JSX. Check each Babel plugin it adds against Solid 2's compiled output.",
        guide: IMPORTS_GUIDE,
      }));
    }
    if (key === "solid" && value?.kind() === "object") {
      for (const option of value.children().filter((child) => child.kind() === "pair")) {
        const name = propertyName(option);
        const optionValue = option.field("value");
        const oldModule = name === "moduleName" && optionValue?.is("string") === true && stringLiteralValue(optionValue) === "solid-js/web";
        if (name !== "omitServerOnlyTemplates" && !oldModule) continue;
        findings.push(finding(filename, option, {
          severity: "build",
          headline: oldModule ? 'Set solid.moduleName to "@solidjs/web" or remove it.' : "Remove solid.omitServerOnlyTemplates; Solid 2's compiler has no such option.",
          why: oldModule
            ? "The compiler imports its runtime helpers from moduleName, and Solid 2 has no solid-js/web module; @solidjs/web is the default."
            : "@solidjs/compiler, which @solidjs/vite-plugin 3 runs, dropped omitServerOnlyTemplates, and the plugin's option types reject it.",
          guidance: oldModule ? "Delete the option to take the default, or set it to \"@solidjs/web\"." : "Delete the option.",
          guide: IMPORTS_GUIDE,
        }));
      }
    }
  }
  return findings;
}

/** A pair's key as written, when it is an identifier or a string. */
function propertyName(pair: SgNode<TSX>): string | null {
  const key = pair.field("key");
  if (key === null) return null;
  if (key.kind() === "property_identifier") return key.text();
  return key.is("string") ? stringLiteralValue(key) : null;
}
