import { BUMPS, SOLID_RANGE } from "./manifest.mjs";

const ON_SOLID_2 = /(^|[^0-9.])2\.\d/;
const PLAIN_RANGE = /^[\s^~<>=v]*\d/;
const ENTRY = /^(\s+)(["']?)([^"'\s:#]+)\2:\s*(["']?)([^"'#]*?)\4\s*(#.*)?$/d;

/**
 * The catalogs of a pnpm-workspace.yaml, read line by line: the default
 * `catalog:` block under the name "" and each `catalogs:` child under its
 * own name. Each entry keeps its 0-based line and the span of its value, so
 * edits touch nothing else. Flow-style maps and anchors are not read.
 */
export function readCatalogs(text) {
  const catalogs = new Map();
  const lines = text.split("\n");
  let offset = 0;
  let current = null;
  let inCatalogs = false;
  let childIndent = null;
  lines.forEach((line, index) => {
    const start = offset;
    offset += line.length + 1;
    if (/^\S/.test(line)) {
      current = /^catalog:\s*(#.*)?$/.test(line) ? catalog(catalogs, "") : null;
      inCatalogs = /^catalogs:\s*(#.*)?$/.test(line);
      childIndent = null;
      return;
    }
    if (inCatalogs) {
      const child = /^(\s+)(["']?)([^"'\s:#]+)\2:\s*(#.*)?$/.exec(line);
      if (child !== null && (childIndent === null || child[1].length === childIndent)) {
        childIndent = child[1].length;
        current = catalog(catalogs, child[3]);
        return;
      }
    }
    if (current === null) return;
    const match = ENTRY.exec(line);
    if (match === null || (inCatalogs && match[1].length <= childIndent)) return;
    const [valueStart, valueEnd] = match.indices[5];
    current.set(match[3], { range: match[5], line: index, indent: match[1], valueStart: start + valueStart, valueEnd: start + valueEnd });
  });
  return catalogs;
}

function catalog(catalogs, name) {
  if (!catalogs.has(name)) catalogs.set(name, new Map());
  return catalogs.get(name);
}

/** The catalog name a `catalog:` or `catalog:name` specifier points at, or null. */
export function catalogName(specifier) {
  const match = /^catalog:(.*)$/.exec(specifier ?? "");
  if (match === null) return null;
  return match[1] === "default" ? "" : match[1];
}

/**
 * Moves every catalog in a pnpm-workspace.yaml that holds a Solid 1 solid-js
 * to Solid 2, the way `bumpManifest` moves a package.json: solid-js and each
 * package in `BUMPS` get their Solid 2 range, and @solidjs/web is added
 * right after solid-js when the catalog lacks it, so a package that declares
 * `"solid-js": "catalog:"` can declare `"@solidjs/web": "catalog:"` too.
 * Returns null when no catalog holds a Solid 1 solid-js.
 */
export function bumpCatalogs(text) {
  const edits = [];
  const changes = [];
  const skipped = [];
  for (const [name, entries] of readCatalogs(text)) {
    const solid = entries.get("solid-js");
    if (solid === undefined || ON_SOLID_2.test(solid.range)) continue;
    for (const [dependency, entry] of entries) {
      const target = BUMPS[dependency];
      if (target === undefined || entry.range === target) continue;
      if (!PLAIN_RANGE.test(entry.range)) {
        skipped.push({ name: dependency, range: entry.range, reason: "it isn't a plain semver range" });
        continue;
      }
      edits.push({ start: entry.valueStart, end: entry.valueEnd, text: target });
      changes.push({ catalog: name, name: dependency, from: entry.range, to: target, line: entry.line + 1 });
    }
    if (!entries.has("@solidjs/web")) {
      const lineEnd = text.indexOf("\n", solid.valueEnd);
      const at = lineEnd === -1 ? text.length : lineEnd;
      edits.push({ start: at, end: at, text: `\n${solid.indent}"@solidjs/web": ${SOLID_RANGE}` });
      changes.push({ catalog: name, name: "@solidjs/web", from: null, to: SOLID_RANGE, line: solid.line + 2 });
    }
  }
  if (changes.length === 0 && skipped.length === 0) return null;
  let result = text;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return { text: result, changes, skipped };
}
