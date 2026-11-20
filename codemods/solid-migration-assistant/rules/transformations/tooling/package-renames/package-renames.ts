import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findModuleReferences, stringLiteralValue } from "../../../../shared/analysis.ts";
import { isSolidPreset, presetBlocker, SOLID_BABEL_PLUGIN } from "../../../../shared/babel.mjs";
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
 *
 * The workflow passes `params.renamed`, a JSON object from every package
 * directory to the packages migrate swapped in its package.json (directly
 * or through a pnpm catalog it edited). A file follows its nearest package
 * directory, and an import moves only when that package now depends on the
 * successor, so a swap migrate couldn't make (a catalog outside the target)
 * never leaves an import of a package nothing installs. Without the param
 * (fixtures, a plain jssg run) every reference moves.
 */
export function relocateRenamedPackages(
  rootNode: SgNode<TSX>,
  filename: string,
  params?: Readonly<Record<string, string>>,
): TransformChange[] {
  const allowed = swappedHere(filename, params?.renamed);
  const shadowedRequire = findBindings(rootNode, "require", { ignoreAmbient: true }).length > 0;
  const changes: TransformChange[] = [];
  for (const { source, moduleName, form } of findModuleReferences(rootNode)) {
    const replacement = RENAMED_PACKAGES.get(moduleName);
    if (replacement === undefined || (form === "require" && shadowedRequire)) continue;
    if (allowed !== null && !allowed.includes(moduleName)) continue;
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
 * The packages swapped for the file's nearest package directory in
 * `renamed` (see above), or null when there is no such map: every rename
 * applies. A directory missing from the map, or a map that doesn't parse,
 * allows none.
 */
function swappedHere(filename: string, renamed: string | undefined): string[] | null {
  if (renamed === undefined) return null;
  let map: unknown;
  try {
    map = JSON.parse(renamed);
  } catch {
    return [];
  }
  if (map === null || typeof map !== "object") return [];
  const directories = Object.keys(map)
    .filter((directory) => directory === "." || filename.startsWith(`${directory}/`))
    .sort((left, right) => (left === "." ? 0 : left.length) - (right === "." ? 0 : right.length));
  const nearest = directories.length === 0 ? undefined : Object.getOwnPropertyDescriptor(map, directories[directories.length - 1]!)?.value;
  return Array.isArray(nearest) ? nearest.filter((name): name is string => typeof name === "string") : [];
}

/**
 * Moves babel-preset-solid from a Babel `presets` list to the `plugins`
 * list beside it as @solidjs/babel-plugin, its Solid 2 successor (a plugin,
 * not a preset), in a babel.config.js or any Babel options object (rollup's
 * babel(), babel-loader's options): `presets: ["solid"]`,
 * `["babel-preset-solid"]` and `[["solid", { ...options }]]`. An existing
 * plugins array gets the entry appended; one that already names the plugin
 * isn't given a second. `moduleName: "solid-js/web"` becomes "@solidjs/web",
 * the plugin's default.
 *
 * Only shapes `presetBlocker` (`shared/babel.mjs`) proves compile the same
 * move: string names, options that carry over unchanged, and no preset other
 * than TypeScript's listed after it. Everything else stays a
 * tooling/build-config finding. Like the imports, the config moves only in a
 * package whose package.json migrate swapped to @solidjs/babel-plugin.
 */
export function rewriteBabelPresets(
  rootNode: SgNode<TSX>,
  filename: string,
  params?: Readonly<Record<string, string>>,
): TransformChange[] {
  const allowed = swappedHere(filename, params?.renamed);
  if (allowed !== null && !allowed.includes("babel-preset-solid")) return [];
  const lines = rootNode.text().split("\n");
  const indentOf = (node: SgNode<TSX>) => /^[ \t]*/.exec(lines[node.range().start.line] ?? "")?.[0] ?? "";
  const members = (node: SgNode<TSX>) => node.children().filter((child) => child.isNamed() && child.kind() !== "comment");
  const keyName = (pair: SgNode<TSX>) => {
    const key = pair.field("key");
    if (key === null) return null;
    return key.kind() === "property_identifier" ? key.text() : key.is("string") ? stringLiteralValue(key) : null;
  };
  // A presets or plugins entry's name: a string, or a [name, options] pair's first element.
  const nameNode = (entry: SgNode<TSX>) => (entry.kind() === "array" ? members(entry)[0] : entry);
  const entryName = (entry: SgNode<TSX>) => {
    const name = nameNode(entry);
    return name !== undefined && name.is("string") ? stringLiteralValue(name) : null;
  };
  const span = (start: SgNode<TSX>, end: SgNode<TSX>, insertedText = "") => ({ startPos: start.range().start.index, endPos: end.range().end.index, insertedText });
  // Removes list[index] (array items or object members) with one separating
  // comma: from the previous entry's end, or for the first entry up to
  // whatever follows its comma, so comments that belong to the next entry stay.
  const removal = (list: SgNode<TSX>[], index: number) => {
    const previous = list[index - 1];
    const item = list[index]!;
    if (previous !== undefined) return { startPos: previous.range().end.index, endPos: item.range().end.index, insertedText: "" };
    const comma = item.next();
    const following = comma?.text() === "," ? comma.next() : null;
    if (list[index + 1] === undefined || following === null || following === undefined) return span(item, item);
    return { startPos: item.range().start.index, endPos: following.range().start.index, insertedText: "" };
  };

  const changes: TransformChange[] = [];
  for (const presets of rootNode.findAll({ rule: { kind: "pair" } })) {
    const list = presets.field("value");
    const object = presets.parent();
    if (keyName(presets) !== "presets" || list?.kind() !== "array" || object?.kind() !== "object") continue;
    const items = members(list);
    const solid = items.filter((item) => isSolidPreset(entryName(item)));
    const item = solid[0];
    const name = item === undefined ? undefined : nameNode(item);
    if (solid.length !== 1 || item === undefined || name === undefined) continue;
    const index = items.findIndex((entry) => entry.id() === item.id());
    const optionsNode = item.kind() === "array" ? members(item)[1] : undefined;
    const optionPairs = optionsNode?.kind() === "object" && members(item).length === 2 ? members(optionsNode) : null;
    const options = optionsNode === undefined ? null : optionPairs === null ? "opaque" : optionPairs.map((option) => {
      if (option.kind() === "shorthand_property_identifier") return { name: option.text(), value: null };
      const value = option.field("value");
      return {
        name: option.kind() === "pair" ? keyName(option) : null,
        value: value !== null && value.is("string") ? stringLiteralValue(value) : null,
      };
    });
    const siblings = members(object);
    const plugins = siblings.find((member) => member.kind() === "pair" && keyName(member) === "plugins");
    const pluginList = plugins?.field("value");
    const pluginItems = pluginList?.kind() === "array" ? members(pluginList) : [];
    const hasPlugin = pluginItems.some((plugin) => entryName(plugin) === SOLID_BABEL_PLUGIN);
    const blocker = presetBlocker({
      options,
      after: items.slice(index + 1).map(entryName),
      // A spread in the options object may bring its own plugins.
      plugins: siblings.some((member) => member.kind() !== "pair" && member.kind() !== "shorthand_property_identifier" && member.kind() !== "method_definition")
        ? "opaque"
        : plugins === undefined ? "none" : pluginList?.kind() === "array" ? "array" : "opaque",
      hasPlugin,
    });
    if (blocker !== null) continue;

    // The entry as written, with the plugin's name and moduleName's value replaced.
    const quote = name.text()[0];
    let entry = item.text().replace(name.text(), `${quote}${SOLID_BABEL_PLUGIN}${quote}`);
    for (const option of optionPairs ?? []) {
      const value = option.kind() === "pair" && keyName(option) === "moduleName" ? option.field("value") : null;
      if (value !== null) entry = entry.replace(option.text(), option.text().replace(value.text(), `${quote}@solidjs/web${quote}`));
    }
    const report = rewrite(filename, name, "Move babel-preset-solid from presets to plugins as @solidjs/babel-plugin, its Solid 2 successor.", IMPORTS_GUIDE);
    const key = presets.field("key");
    if (plugins === undefined && items.length === 1 && key !== null) {
      const pluginsKey = key.kind() === "property_identifier" ? "plugins" : `${key.text()[0]}plugins${key.text()[0]}`;
      changes.push({ edit: span(key, key, pluginsKey), report }, { edit: span(item, item, entry), report });
      continue;
    }
    changes.push({ edit: items.length === 1 ? removal(siblings, siblings.findIndex((member) => member.id() === presets.id())) : removal(items, index), report });
    if (hasPlugin) continue;
    if (plugins === undefined) {
      const pluginsKey = key?.kind() === "property_identifier" ? "plugins" : `${quote}plugins${quote}`;
      const multiline = object.text().includes("\n");
      const at = presets.range().end.index;
      changes.push({ edit: { startPos: at, endPos: at, insertedText: `,${multiline ? `\n${indentOf(presets)}` : " "}${pluginsKey}: [${entry}]` }, report });
      continue;
    }
    if (pluginList === null || pluginList === undefined) continue;
    const last = pluginItems[pluginItems.length - 1];
    if (last === undefined) {
      const at = pluginList.range().start.index + 1;
      changes.push({ edit: { startPos: at, endPos: at, insertedText: entry }, report });
      continue;
    }
    const multiline = pluginList.text().includes("\n");
    const at = last.range().end.index;
    changes.push({ edit: { startPos: at, endPos: at, insertedText: `,${multiline ? `\n${indentOf(last)}` : " "}${entry}` }, report });
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
