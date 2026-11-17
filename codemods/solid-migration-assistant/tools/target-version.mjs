// Packages published together from the Solid repository, so they share the pinned version.
const LOCKSTEP = ["solid-js", "@solidjs/web", "@solidjs/signals", "@solidjs/h", "@solidjs/html", "@solidjs/universal", "@solidjs/babel-plugin"];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replaces the pinned Solid version where the text says it is Solid's:
 * `Solid <v>`, `solid-js@<v>`, `"@solidjs/web": "^<v>"`, `solid-js ... to ^<v>`
 * and the `*_VERSION = "<v>"` constants. A bare version can also be a router,
 * a Codemod or an unrelated release, so any other mention is left for review.
 */
export function replaceTargetVersion(text, from, to) {
  const name = `(?:${LOCKSTEP.map(escape).join("|")})`;
  const context = [
    "\\bSolid[ `]+",
    `${name}@`,
    `${name}\`? (?:from \\S+ )?to \\^?`,
    `${name} \\^?`,
    `"${name}":\\s*"[\\^~]?`,
    `_VERSION = "`,
  ].join("|");
  const pattern = new RegExp(`(?<=${context})${escape(from)}(?![-\\w]|\\.\\d)`, "g");
  return text.replace(pattern, to);
}

/** Lines that still cite `version` after replacement, for the person bumping to check. */
export function remainingMentions(text, version) {
  const pattern = new RegExp(`(?<![\\w.])${escape(version)}(?![-\\w]|\\.\\d)`);
  return text.split("\n").flatMap((line, index) => (pattern.test(line) ? [index + 1] : []));
}
