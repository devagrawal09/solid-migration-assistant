import { alreadyMoved, BUMPS, RENAMES, SOLID_RANGE } from "./manifest.mjs";
import { isSolid2Only } from "./peers.mjs";

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
    current.set(match[3], {
      range: match[5],
      line: index,
      indent: match[1],
      keyQuote: match[2],
      valueQuote: match[4],
      keyStart: start + match[1].length,
      valueStart: start + valueStart,
      valueEnd: start + valueEnd,
    });
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
 *
 * A package that is the same package under a new name (`RENAMES`) is
 * swapped for its successor in every catalog, keeping the entry's line,
 * quotes and comment; a YAML key that starts with `@` must be quoted, so an
 * unquoted key gets double quotes. The package.json entries that take it
 * from that catalog are renamed by `bumpManifest` (see `catalogPlan`).
 * Returns null when there is nothing to move.
 */
export function bumpCatalogs(text) {
  const edits = [];
  const changes = [];
  const skipped = [];
  for (const [name, entries] of readCatalogs(text)) {
    for (const [dependency, entry] of entries) {
      const rename = RENAMES[dependency];
      if (rename === undefined) continue;
      if (entries.has(rename.name)) {
        skipped.push({ name: dependency, range: entry.range, reason: `${rename.name} is in the same catalog too, so remove ${dependency}` });
        continue;
      }
      if (!PLAIN_RANGE.test(entry.range)) {
        skipped.push({ name: dependency, range: entry.range, reason: `it isn't a plain semver range; replace it with ${rename.name} ${rename.range}` });
        continue;
      }
      const quote = entry.keyQuote === "" ? '"' : entry.keyQuote;
      edits.push({ start: entry.keyStart, end: entry.valueEnd, text: `${quote}${rename.name}${quote}: ${entry.valueQuote}${rename.range}` });
      changes.push({ catalog: name, name: dependency, from: entry.range, to: rename.range, renamedTo: rename.name, line: entry.line + 1 });
    }
    const solid = entries.get("solid-js");
    if (solid === undefined || isSolid2Only(solid.range)) continue;
    for (const [dependency, entry] of entries) {
      const target = BUMPS[dependency];
      if (target === undefined || entry.range === target) continue;
      if (!PLAIN_RANGE.test(entry.range)) {
        skipped.push({ name: dependency, range: entry.range, reason: "it isn't a plain semver range" });
        continue;
      }
      if (alreadyMoved(dependency, entry.range)) continue;
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

/**
 * What the catalogs of a pnpm-workspace.yaml will hold once migrate moves
 * them, for the package.json edits that take dependencies from them:
 * `web`, the catalogs (by name, "" for the default) that hold or get
 * @solidjs/web, so a package may take it from there; and `renames`, each
 * `[catalog, from, to]` package swapped for its successor, so a package's
 * `"from": "catalog:x"` entry becomes `"to": "catalog:x"`. A workspace file
 * outside the target ("" here) moves nothing, so a package keeps its
 * catalog entries and is told to move them by hand.
 */
export function catalogPlan(text) {
  const bumped = bumpCatalogs(text);
  const after = readCatalogs(bumped === null ? text : bumped.text);
  return {
    web: [...after].filter(([, entries]) => entries.has("@solidjs/web")).map(([name]) => name),
    renames: (bumped?.changes ?? []).filter((change) => change.renamedTo !== undefined).map((change) => [change.catalog, change.name, change.renamedTo]),
  };
}
