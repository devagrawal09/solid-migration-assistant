import { DEPENDENCY_MAP } from "./dependencies.mjs";
import { allowsSolid2, isSolid2Only } from "./peers.mjs";

export const SOLID_VERSION = "2.0.0";
/** What migrate writes for solid-js and @solidjs/web: stable releases take a caret range. */
export const SOLID_RANGE = `^${SOLID_VERSION}`;
const SECTIONS = ["dependencies", "devDependencies"];
const PLAIN_RANGE = /^[\s^~<>=v]*\d/;

/**
 * The Solid 2 range each package moves to in migrate mode: solid-js and
 * @solidjs/web at the pinned version, and every `upgrade` entry of the dependency
 * table at its verified version. A stable version gets a caret so patches
 * install; a prerelease stays exact, since a caret on it would also accept
 * later, possibly breaking, prereleases. `replace`, `use-core` and `blocked` entries
 * need code or config changes, so they are reported and never edited.
 */
export const BUMPS = Object.freeze({
  "solid-js": SOLID_RANGE,
  "@solidjs/web": SOLID_RANGE,
  ...Object.fromEntries(
    DEPENDENCY_MAP.filter((entry) => entry.status === "upgrade" && entry.replacement?.startsWith(`${entry.name}@`))
      .map((entry) => {
        const version = entry.replacement.slice(entry.name.length + 1);
        return [entry.name, version.includes("-") ? version : `^${version}`];
      }),
  ),
});

// A dependency already on its Solid 2 line keeps its range, so a newer
// minor than the table's is never moved back.
const ALREADY_MOVED = {
  "@solidjs/web": allowsSolid2,
  ...Object.fromEntries(DEPENDENCY_MAP.filter((entry) => entry.legacy !== null).map((entry) => [entry.name, (range) => !entry.legacy(range)])),
};
export const alreadyMoved = (dependency, range) => ALREADY_MOVED[dependency]?.(range) === true;

/**
 * Moves a Solid 1 package.json to Solid 2 by editing only the version strings
 * it changes, so formatting, key order and every other line stay as written.
 *
 * In `dependencies` and `devDependencies`, solid-js and each package in
 * `BUMPS` move to their Solid 2 version, and @solidjs/web is added right after
 * solid-js when it is missing. A range that is not plain semver (workspace:,
 * catalog:, git, link:, npm: aliases, tags) is left alone and reported in
 * `skipped`, as are peerDependencies, whose range is the library author's
 * call. Returns null when the manifest declares no Solid 1 solid-js.
 */
export function bumpManifest(text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return null;
  }
  const section = SECTIONS.find((name) => typeof manifest[name]?.["solid-js"] === "string");
  if (section === undefined || isSolid2Only(manifest[section]["solid-js"])) return null;

  const edits = [];
  const changes = [];
  const skipped = [];
  for (const name of SECTIONS) {
    for (const [dependency, range] of Object.entries(manifest[name] ?? {})) {
      const target = BUMPS[dependency];
      if (target === undefined || typeof range !== "string" || range === target) continue;
      if (!PLAIN_RANGE.test(range)) {
        skipped.push({ name: dependency, range, reason: range.startsWith("catalog:") ? "it comes from the workspace catalog, so move it there" : "it isn't a plain semver range" });
        continue;
      }
      if (alreadyMoved(dependency, range)) continue;
      const edit = valueEdit(text, name, dependency, range, target);
      if (edit === null) {
        skipped.push({ name: dependency, range, reason: "it couldn't be located in the file" });
        continue;
      }
      edits.push(edit);
      changes.push({ name: dependency, from: range, to: target, line: edit.line });
    }
  }
  if (typeof manifest.peerDependencies?.["solid-js"] === "string") {
    skipped.push({ name: "solid-js", range: manifest.peerDependencies["solid-js"], reason: "a peer range is the library author's call" });
  }

  // @solidjs/web only goes in beside a solid-js this edit moved, so the two
  // never end up on different majors. A solid-js taken from a pnpm catalog
  // moves in pnpm-workspace.yaml (`shared/catalog.mjs`), which adds
  // @solidjs/web to the same catalog, so the package takes it from there too.
  const hasWeb = SECTIONS.some((name) => manifest[name]?.["@solidjs/web"] !== undefined);
  const solidRange = manifest[section]["solid-js"];
  const fromCatalog = solidRange.startsWith("catalog:");
  if (!hasWeb && (fromCatalog || changes.some((change) => change.name === "solid-js"))) {
    const webRange = fromCatalog ? solidRange : SOLID_RANGE;
    const anchor = valueEdit(text, section, "solid-js", solidRange, webRange);
    if (anchor !== null) {
      // Insert right after the solid-js value; any comma that followed it
      // now follows the new entry. Multi-line objects get their own line.
      const lineStart = text.lastIndexOf("\n", anchor.start) + 1;
      const multiline = text.slice(lineStart, anchor.start).trim().startsWith('"solid-js"');
      const separator = multiline ? `\n${/^\s*/.exec(text.slice(lineStart))[0]}` : " ";
      edits.push({ start: anchor.end, end: anchor.end, text: `,${separator}"@solidjs/web": "${webRange}"` });
      changes.push({ name: "@solidjs/web", from: null, to: webRange, line: anchor.line + 1 });
    }
  }

  let result = text;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return { text: result, changes, skipped };
}

/**
 * Points tsconfig's `jsxImportSource` at @solidjs/web when it is exactly
 * "solid-js", editing only that string. Returns null when nothing changes.
 */
export function bumpTsconfig(text) {
  const match = /("jsxImportSource"\s*:\s*)"solid-js"/.exec(text);
  if (match === null) return null;
  const at = match.index + match[1].length;
  return {
    text: `${text.slice(0, at)}"@solidjs/web"${text.slice(at + '"solid-js"'.length)}`,
    line: text.slice(0, match.index).split("\n").length,
  };
}

/**
 * The span of `"dependency": "range"`'s value inside the `section` object of
 * the raw manifest text, or null when it cannot be found unambiguously.
 */
function valueEdit(text, section, dependency, range, target) {
  const open = topLevelObject(text, section);
  if (open === null) return null;
  const close = text.indexOf("}", open);
  if (close === -1) return null;
  const pattern = new RegExp(`("${escape(dependency)}"\\s*:\\s*)"${escape(range)}"`, "g");
  const body = text.slice(open, close);
  const matches = [...body.matchAll(pattern)];
  if (matches.length !== 1) return null;
  const start = open + matches[0].index + matches[0][1].length;
  const end = start + JSON.stringify(range).length;
  return { start, end, text: JSON.stringify(target), line: text.slice(0, start).split("\n").length };
}

/**
 * The index just after the `{` of the top-level `"key": {`, skipping keys of
 * the same name nested deeper (such as pnpm.packageExtensions.x.dependencies).
 */
function topLevelObject(text, key) {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
    else if (char === '"') {
      const end = stringEnd(text, index);
      if (depth === 1 && text.slice(index + 1, end) === key) {
        const rest = /^\s*:\s*\{/.exec(text.slice(end + 1));
        if (rest !== null) return end + 1 + rest[0].length;
      }
      index = end;
    }
  }
  return null;
}

function stringEnd(text, start) {
  let index = start + 1;
  while (index < text.length && text[index] !== '"') index += text[index] === "\\" ? 2 : 1;
  return index;
}

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
