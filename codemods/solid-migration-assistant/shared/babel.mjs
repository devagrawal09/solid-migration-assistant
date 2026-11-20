/**
 * babel-preset-solid → @solidjs/babel-plugin, for Babel configs. The preset
 * (1.9.19) is one plugin, babel-plugin-jsx-dom-expressions 0.40.14, with
 * Solid's defaults; @solidjs/babel-plugin 2.0.2 is that plugin for Solid 2
 * with the same defaults built in (its README: "Omitted options are the
 * Solid 2.0 defaults that used to live in babel-preset-solid"). Both were
 * read from the published packages on 2026-11-19.
 *
 * Migrate moves a preset entry to plugins only when it can prove the result
 * compiles the same way: every option it passes has the same name, meaning
 * and default in both, and no preset ran before it that now runs after it.
 * Anything else stays a finding with the reason (`presetBlocker`).
 *
 * Used by tooling/package-renames (JavaScript configs, through jssg) and by
 * the JSON config edits below (.babelrc, .babelrc.json, babel.config.json),
 * which the workflow and the launcher run on the files jssg can't parse.
 */

export const SOLID_BABEL_PLUGIN = "@solidjs/babel-plugin";

/**
 * Options both compilers take with the same meaning and default
 * (jsx-dom-expressions 0.40.14's `config` with the preset's overrides, and
 * @solidjs/babel-plugin 2.0.2's `config`). generate keeps "dom" and "ssr";
 * contextToCustomElements is true in both (the preset set it).
 */
const CARRIED_OPTIONS = new Set([
  "generate",
  "hydratable",
  "delegateEvents",
  "delegatedEvents",
  "wrapConditionals",
  "contextToCustomElements",
  "requireImportSource",
  "omitNestedClosingTags",
  "omitLastClosingTag",
  "omitQuotes",
  "omitAttributeSpacing",
  "validate",
  "inlineStyles",
  "effectWrapper",
  "memoWrapper",
]);

/** Why each preset option that changed can't be carried over as written. */
const CHANGED_OPTIONS = new Map([
  ["moduleName", 'moduleName names a module other than solid-js/web (a custom renderer?); @solidjs/babel-plugin defaults to "@solidjs/web", so check the renderer has a Solid 2 release'],
  ["builtIns", "builtIns lists Solid 1 components; @solidjs/babel-plugin's default list has Solid 2's (Loading, Reveal, Repeat, Errored replace Suspense, SuspenseList, Index, ErrorBoundary)"],
  ["staticMarker", 'the static marker changed from "@once" to "@static", and Solid 2 removed /*@once*/'],
  ["omitServerOnlyTemplates", "@solidjs/babel-plugin has no omitServerOnlyTemplates option"],
  ["renderers", "renderers configures custom renderers; check each has a Solid 2 release"],
]);

/** Presets Solid's compiler may run before: TypeScript only strips types. */
const TYPESCRIPT_PRESETS = new Set(["@babel/preset-typescript", "@babel/typescript", "typescript"]);

export function isSolidPreset(name) {
  return name === "solid" || name === "babel-preset-solid";
}

/**
 * Why one preset entry naming babel-preset-solid can't move to plugins as
 * is, or null when it can.
 *
 * - `options`: null when the entry has none; otherwise its options as
 *   `{ name, value }` (name null for a spread or computed key, value the
 *   string value or null when it isn't a string literal), or `"opaque"` when
 *   they aren't an object literal.
 * - `after`: the names of the presets listed after it (null for one that
 *   isn't a string). Babel runs presets last to first, after every plugin,
 *   so those ran before Solid's compiler and would now run after it; only
 *   TypeScript's, which @solidjs/vite-plugin 3.0.1 itself runs Solid's
 *   plugin ahead of, is allowed.
 * - `plugins`: "none", "array" or "opaque" for the sibling plugins option,
 *   and `hasPlugin` whether that array already names @solidjs/babel-plugin.
 */
export function presetBlocker({ options, after, plugins, hasPlugin }) {
  if (options === "opaque") return "its options aren't an object literal";
  for (const option of options ?? []) {
    if (option.name === null) return "its options spread or compute a key";
    if (option.name === "moduleName" && option.value === "solid-js/web") continue;
    if (CHANGED_OPTIONS.has(option.name)) return CHANGED_OPTIONS.get(option.name);
    if (!CARRIED_OPTIONS.has(option.name)) return `${option.name} isn't a babel-preset-solid option @solidjs/babel-plugin takes unchanged`;
  }
  const before = after.find((name) => name === null || !TYPESCRIPT_PRESETS.has(name));
  if (before !== undefined) {
    return `${before === null ? "a preset listed after it" : before} ran before it; as a plugin it would run first`;
  }
  if (plugins === "opaque") return "the plugins option beside it isn't an array literal";
  if (hasPlugin && options !== null) return "plugins already names @solidjs/babel-plugin";
  return null;
}

/**
 * Moves every babel-preset-solid entry of a JSON Babel config (.babelrc,
 * .babelrc.json, babel.config.json; comments and trailing commas allowed)
 * to the plugins option beside it as @solidjs/babel-plugin, wherever a
 * presets list sits (top level, env.*, overrides[]), editing only those
 * spans. `moduleName: "solid-js/web"` becomes "@solidjs/web", the plugin's
 * default. Returns null when the file doesn't parse or names no Solid
 * preset; otherwise the new text, the `moved` entries and the `left` ones
 * with their reason, each at its line and column.
 */
export function bumpBabelConfig(text) {
  const root = parseJsonc(text);
  if (root === null) return null;
  const edits = [];
  const moved = [];
  const left = [];
  const at = (offset) => {
    const before = text.slice(0, offset).split("\n");
    return { line: before.length, column: before[before.length - 1].length + 1 };
  };
  const visit = (node) => {
    if (node.type === "array") node.items.forEach(visit);
    if (node.type !== "object") return;
    node.pairs.forEach((pair) => visit(pair.value));
    const presets = node.pairs.find((pair) => pair.key.value === "presets");
    if (presets === undefined || presets.value.type !== "array") return;
    const items = presets.value.items;
    const solid = items.flatMap((item, index) => (isSolidPreset(entryName(item)) ? [index] : []));
    if (solid.length === 0) return;
    const index = solid[0];
    const item = items[index];
    const name = item.type === "array" ? item.items[0] : item;
    if (solid.length > 1) {
      for (const other of solid) left.push({ ...at(nameOf(items[other]).start), reason: "babel-preset-solid is listed more than once" });
      return;
    }
    const optionsNode = item.type === "array" ? item.items[1] : undefined;
    const options = optionsNode === undefined
      ? null
      : optionsNode.type !== "object" || item.items.length > 2
        ? "opaque"
        : optionsNode.pairs.map((pair) => ({ name: pair.key.value, value: pair.value.type === "string" ? pair.value.value : null, node: pair.value }));
    const plugins = node.pairs.find((pair) => pair.key.value === "plugins");
    const pluginItems = plugins?.value.type === "array" ? plugins.value.items : [];
    const reason = presetBlocker({
      options,
      after: items.slice(index + 1).map(entryName),
      plugins: plugins === undefined ? "none" : plugins.value.type === "array" ? "array" : "opaque",
      hasPlugin: pluginItems.some((plugin) => entryName(plugin) === SOLID_BABEL_PLUGIN),
    });
    if (reason !== null) {
      left.push({ ...at(name.start), reason });
      return;
    }

    // The entry as written, with the plugin's name and moduleName's value replaced.
    const replaced = [{ start: name.start, end: name.end, text: JSON.stringify(SOLID_BABEL_PLUGIN) }];
    for (const option of Array.isArray(options) ? options : []) {
      if (option.name === "moduleName") replaced.push({ start: option.node.start, end: option.node.end, text: '"@solidjs/web"' });
    }
    let entry = text.slice(item.start, item.end);
    for (const edit of replaced.sort((left, right) => right.start - left.start)) {
      entry = entry.slice(0, edit.start - item.start) + edit.text + entry.slice(edit.end - item.start);
    }
    moved.push(at(name.start));

    if (plugins === undefined && items.length === 1) {
      edits.push({ start: presets.key.start, end: presets.key.end, text: '"plugins"' }, { start: item.start, end: item.end, text: entry });
      return;
    }
    edits.push(items.length === 1 ? removal(text, node.pairs, node.pairs.indexOf(presets)) : removal(text, items, index));
    if (pluginItems.some((plugin) => entryName(plugin) === SOLID_BABEL_PLUGIN)) return;
    if (plugins === undefined) {
      const multiline = text.slice(node.start, node.end).includes("\n");
      edits.push({ start: presets.end, end: presets.end, text: `,${multiline ? `\n${indentAt(text, presets.start)}` : " "}"plugins": [${entry}]` });
      return;
    }
    edits.push(append(text, plugins.value, entry));
  };
  visit(root);
  if (moved.length === 0 && left.length === 0) return null;
  let result = text;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return { text: result, moved, left };
}

/** A presets or plugins entry's name: the string, or a [name, options] pair's first string. */
function entryName(node) {
  const name = nameOf(node);
  return name.type === "string" ? name.value : null;
}

function nameOf(node) {
  return node.type === "array" && node.items.length > 0 ? node.items[0] : node;
}

/** The span that removes `list[index]` (array items or object pairs) with one separating comma. */
function removal(text, list, index) {
  if (index < list.length - 1) return { start: list[index].start, end: list[index + 1].start, text: "" };
  if (index > 0) return { start: list[index - 1].end, end: list[index].end, text: "" };
  return { start: list[index].start, end: list[index].end, text: "" };
}

/** Appends `entry` to an array node, on its own line when the array spans lines. */
function append(text, array, entry) {
  const last = array.items[array.items.length - 1];
  if (last === undefined) return { start: array.start + 1, end: array.start + 1, text: entry };
  const multiline = text.slice(array.start, array.end).includes("\n");
  return { start: last.end, end: last.end, text: `,${multiline ? `\n${indentAt(text, last.start)}` : " "}${entry}` };
}

function indentAt(text, offset) {
  return /^[ \t]*/.exec(text.slice(text.lastIndexOf("\n", offset - 1) + 1))[0];
}

/**
 * A JSON parse that keeps each value's span: objects (`pairs` of string
 * `key` and `value`), arrays (`items`), strings (`value`) and other
 * literals, each with `start` and `end` offsets. Comments and trailing
 * commas are allowed, as Babel allows them. Returns null when the text
 * doesn't parse.
 */
function parseJsonc(text) {
  let at = 0;
  const skip = () => {
    for (;;) {
      const space = /^\s+/.exec(text.slice(at));
      if (space !== null) at += space[0].length;
      if (text.startsWith("//", at)) {
        const end = text.indexOf("\n", at);
        at = end === -1 ? text.length : end;
      } else if (text.startsWith("/*", at)) {
        const end = text.indexOf("*/", at + 2);
        if (end === -1) throw new Error("unterminated comment");
        at = end + 2;
      } else return;
    }
  };
  const value = () => {
    skip();
    const start = at;
    const char = text[at];
    if (char === "{" || char === "[") {
      const close = char === "{" ? "}" : "]";
      const entries = [];
      at += 1;
      for (;;) {
        skip();
        if (text[at] === close) break;
        if (char === "[") entries.push(value());
        else {
          const key = value();
          if (key.type !== "string") throw new Error("object key");
          skip();
          if (text[at] !== ":") throw new Error("colon");
          at += 1;
          const entry = value();
          entries.push({ key, value: entry, start: key.start, end: entry.end });
        }
        skip();
        if (text[at] === ",") at += 1;
        else if (text[at] !== close) throw new Error("separator");
      }
      at += 1;
      return char === "{" ? { type: "object", start, end: at, pairs: entries } : { type: "array", start, end: at, items: entries };
    }
    if (char === '"') {
      at += 1;
      while (at < text.length && text[at] !== '"') at += text[at] === "\\" ? 2 : 1;
      if (at >= text.length) throw new Error("unterminated string");
      at += 1;
      return { type: "string", start, end: at, value: JSON.parse(text.slice(start, at)) };
    }
    const literal = /^(?:true|false|null|-?\d[\d.eE+-]*)/.exec(text.slice(at));
    if (literal === null) throw new Error("value");
    at += literal[0].length;
    return { type: "literal", start, end: at };
  };
  try {
    const root = value();
    skip();
    return at === text.length && root.type === "object" ? root : null;
  } catch {
    return null;
  }
}
