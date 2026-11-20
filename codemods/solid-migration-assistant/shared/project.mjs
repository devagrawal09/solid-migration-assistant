/**
 * Findings for the files every migration must edit that the JSSG analyzers
 * never see: each package.json, tsconfig.json, tsconfig.*.json and
 * jsconfig.json, and each JSON Babel config. Pure functions of a file's path and text, so the launcher
 * (`shared/run-workflow.mjs`, which reads the files itself) and the registry
 * workflow (`workflow.ts`, which reads them in a `forEachFile` step) report
 * the same thing. A file that doesn't parse produces no finding. The
 * guidance mirrors the official Solid 2 templates (solidjs/templates,
 * `solid-v2` group), which depend on `solid-js` and `@solidjs/web` at the
 * same version, build with `@solidjs/vite-plugin`, and set `jsxImportSource`
 * to `@solidjs/web`.
 */
import { bumpBabelConfig } from "./babel.mjs";
import { catalogName, readCatalogs } from "./catalog.mjs";
import { DEPENDENCY_MAP, DEPENDENCY_VERIFIED_ON, dependencyHeadline } from "./dependencies.mjs";
import { byLocation } from "./format.mjs";
import { SOLID_VERSION } from "./manifest.mjs";
import { isSolid2Only } from "./peers.mjs";

// The launcher's copy of shared/target.ts's commit (it cannot import
// TypeScript); the architecture test proves the two agree.
export const SOLID_SOURCE_COMMIT = "68406c2077eff22c67f71db4a16bf7026ddceee1";
export const MIGRATION_GUIDE = `https://github.com/solidjs/solid/blob/${SOLID_SOURCE_COMMIT}/documentation/solid-2.0/MIGRATION.md`;
const SOLID_TARGET = `solid-js@${SOLID_VERSION}`;
const PLAIN_RANGE = /^[\s^~<>=v]*\d/;

/**
 * The findings for one package.json: its Solid version, one finding per
 * dependency-table entry it declares, Vite when the Solid 2 plugin can't run
 * on it, and a library's missing @solidjs/web peer. `workspaceYaml` is the
 * root pnpm-workspace.yaml's text ("" when there is none), so a `catalog:`
 * range is judged by the catalog it names.
 */
export function manifestFindings(file, text, workspaceYaml) {
  const manifest = parseJsonLike(text);
  if (!manifest || typeof manifest !== "object") return [];
  const findings = [];
  const declared = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  const solid = declared["solid-js"];
  const web = declared["@solidjs/web"];
  const catalog = catalogName(solid);
  const resolved = catalog === null ? solid : readCatalogs(workspaceYaml).get(catalog)?.get("solid-js")?.range;
  const where = catalog === null ? "" : catalog === "" ? "the default catalog in pnpm-workspace.yaml" : `the ${catalog} catalog in pnpm-workspace.yaml`;
  const declaredAs = catalog === null ? `is declared as ${JSON.stringify(solid)}` : `comes from ${where} at ${JSON.stringify(resolved)}`;
  const problems = [];
  if (typeof solid === "string" && catalog !== null && resolved === undefined) {
    problems.push(`solid-js comes from ${JSON.stringify(solid)}, a workspace catalog this analyzer couldn't read, so check that it moves to ${SOLID_VERSION} there`);
  } else if (typeof resolved === "string" && PLAIN_RANGE.test(resolved) && !isSolid2Only(resolved)) {
    problems.push(`solid-js ${declaredAs}, a Solid 1 range`);
  } else if (typeof resolved === "string" && !PLAIN_RANGE.test(resolved) && web === undefined) {
    // workspace:, link: and tags name no version this analyzer can read.
    problems.push(`solid-js ${declaredAs}, which this analyzer can't compare with Solid 2`);
  }
  if (typeof solid === "string" && web === undefined) {
    problems.push("@solidjs/web, the Solid 2 web renderer package, is not declared");
  }
  if (problems.length > 0) {
    findings.push({
      rule: "project/solid-version",
      file,
      line: 1,
      column: 1,
      severity: "build",
      headline: `Move this project's Solid dependencies to ${SOLID_TARGET}.`,
      why: `${problems.join("; ")}. Solid 2 splits the web renderer into @solidjs/web, versions it in lockstep with solid-js, and compiles JSX through @solidjs/vite-plugin (or @solidjs/babel-plugin), which is what the official solid-v2 templates use.`,
      guidance: `Move solid-js to ^${SOLID_VERSION}${catalog === null ? "" : ` in ${where || "the workspace catalog"} (migrate edits pnpm catalogs)`} and add @solidjs/web at the same range (the two release in lockstep), move the other Solid dependencies as the per-package findings describe, and run this analyzer before installing, since Solid 1 source is the input this version understands.`,
      lint: [],
      guide: `${MIGRATION_GUIDE}#imports-where-things-live-now`,
    });
  }
  const lines = text.split("\n");
  const at = (name) => {
    const index = lines.findIndex((line) => line.includes(`"${name}"`));
    return index === -1 ? { line: 1, column: 1 } : { line: index + 1, column: lines[index].indexOf(`"${name}"`) + 1 };
  };
  findings.push(...dependencyFindings(manifest, file, at));

  // @solidjs/vite-plugin peers on vite ^8 || ^9; migrate leaves vite alone.
  const vite = declared.vite;
  const usesPlugin = declared["vite-plugin-solid"] !== undefined || declared["@solidjs/vite-plugin"] !== undefined;
  if (usesPlugin && typeof vite === "string" && PLAIN_RANGE.test(vite) && !vite.split("||").some(allowsVite8)) {
    findings.push({
      rule: "project/dependencies",
      file,
      ...at("vite"),
      severity: "build",
      headline: "Move vite to 8 or 9 for @solidjs/vite-plugin.",
      why: `package.json declares vite ${JSON.stringify(vite)}, and @solidjs/vite-plugin 3.0.1, the Solid 2 plugin, peers on vite ^8.0.0 || ^9.0.0 and runs on Node 22.12 or newer. Migrate doesn't move vite, so the install reports a peer conflict.`,
      guidance: "Upgrade vite to ^8 (with any other Vite plugins to releases that support it) and run Node 22.12 or newer, then install again. Read Vite's own migration notes for the majors you skip.",
      lint: [],
      guide: `${MIGRATION_GUIDE}#imports-where-things-live-now`,
    });
  }

  // A library's published types and compiled output import @solidjs/web
  // after the move (JSX types, render, Portal, Dynamic), and a dev
  // dependency doesn't reach the library's users.
  const peers = manifest.peerDependencies ?? {};
  const isLibrary = manifest.exports !== undefined || manifest.main !== undefined || manifest.module !== undefined;
  if (isLibrary && typeof peers["solid-js"] === "string" && peers["@solidjs/web"] === undefined) {
    findings.push({
      rule: "project/dependencies",
      file,
      ...at("peerDependencies"),
      severity: "build",
      headline: "Declare @solidjs/web as a peer dependency of this library.",
      why: `This package publishes code (it has exports, main or module) and peers on solid-js ${JSON.stringify(peers["solid-js"])}. In Solid 2 the JSX namespace, ComponentProps for tags, render, Portal and Dynamic come from @solidjs/web, so the library's .d.ts and output import it; migrate adds it only beside solid-js (a dev dependency here), which its users never install.`,
      guidance: `Add "@solidjs/web": "^${SOLID_VERSION}" to peerDependencies beside solid-js, with the same range as solid-js, since the two release in lockstep. A library that only needs the element type can import Element from solid-js instead of JSX.Element from @solidjs/web (alias it when the file also uses the DOM's Element type) and skip the peer.`,
      lint: [],
      guide: `${MIGRATION_GUIDE}#typescript-jsx-solid-js--renderer-package`,
    });
  }
  return findings;
}

/**
 * Whether one `||` set of a vite range lets vite 8 or 9 install: a lower
 * bound (`>=`, `>`) or a major of 8 or 9. Read loosely; an unreadable set
 * counts as allowed, so nothing is reported.
 */
function allowsVite8(set) {
  const match = /^\s*(>=?)?\s*[\^~=v]*(\d+)/.exec(set);
  if (match === null || match[1] !== undefined) return true;
  return Number(match[2]) === 8 || Number(match[2]) === 9;
}

/**
 * One finding per dependency in `shared/dependencies.mjs` that the manifest
 * declares on its Solid 1 line (or at all, for packages with no Solid 2
 * line), located at the dependency's line so editors can jump to it. A
 * workspace, catalog, or git range cannot be compared and is reported with a
 * note to check it.
 */
function dependencyFindings(manifest, file, at) {
  const findings = [];
  const sections = [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies];
  for (const entry of DEPENDENCY_MAP) {
    const range = sections.map((section) => section?.[entry.name]).find((value) => typeof value === "string");
    if (range === undefined) continue;
    const comparable = PLAIN_RANGE.test(range);
    if (entry.legacy !== null && comparable && !entry.legacy(range)) continue;
    const note = comparable ? "" : ` The declared range ${JSON.stringify(range)} could not be compared, so check which line it resolves to.`;
    findings.push({
      rule: "project/dependencies",
      file,
      ...at(entry.name),
      severity: "build",
      headline: dependencyHeadline(entry),
      why: `package.json declares ${entry.name} ${JSON.stringify(range)}. Checked against the npm registry on ${DEPENDENCY_VERIFIED_ON}: ${entry.replacement === null ? "no Solid 2 release exists" : `the Solid 2 counterpart is ${entry.replacement}`}.${note}`,
      guidance: entry.guidance,
      lint: [],
      guide: `${MIGRATION_GUIDE}#imports-where-things-live-now`,
    });
  }
  return byLocation(findings);
}

/**
 * The findings for one tsconfig.json, tsconfig.*.json or jsconfig.json:
 * `jsxImportSource` still on solid-js, and a module resolution that ignores
 * package `exports`, which Solid 2's packages need.
 */
export function configFindings(file, text) {
  const options = parseJsonLike(text)?.compilerOptions;
  if (!options || typeof options !== "object") return [];
  const findings = [];
  if (options.jsxImportSource === "solid-js") {
    findings.push({
      rule: "project/jsx-import-source",
      file,
      line: 1,
      column: 1,
      severity: "build",
      headline: "Point jsxImportSource at the Solid 2 renderer package.",
      why: 'compilerOptions.jsxImportSource is "solid-js", but Solid 2 no longer ships JSX runtime type entries from solid-js; web projects take them from @solidjs/web (hyperscript projects from @solidjs/h).',
      guidance: 'Set compilerOptions.jsxImportSource to "@solidjs/web" (keep "jsx": "preserve"), and move any import type { JSX } from "solid-js" to @solidjs/web; the transform workflow makes this edit in migrate mode.',
      lint: [],
      guide: `${MIGRATION_GUIDE}#typescript-jsx-solid-js--renderer-package`,
    });
  }
  const resolution = typeof options.moduleResolution === "string" ? options.moduleResolution.toLowerCase() : null;
  if (resolution === "node" || resolution === "node10" || resolution === "classic") {
    const lines = text.split("\n");
    const index = lines.findIndex((line) => /"moduleResolution"/.test(line));
    findings.push({
      rule: "project/module-resolution",
      file,
      line: index === -1 ? 1 : index + 1,
      column: index === -1 ? 1 : lines[index].indexOf('"moduleResolution"') + 1,
      severity: "build",
      headline: `Change moduleResolution from "${options.moduleResolution}" to "bundler" (or "nodenext").`,
      why: `TypeScript's "${options.moduleResolution}" resolution ignores package.json exports. Solid 2's packages publish their entry points only through exports: @solidjs/web/jsx-runtime, which jsxImportSource "@solidjs/web" needs, solid-js/internal and @solidjs/web's subpaths have no file at that path, so JSX and those imports don't typecheck.`,
      guidance: 'Set compilerOptions.moduleResolution to "bundler" (with "module": "esnext" or "preserve") for an app or a library built by a bundler, or "nodenext" (with "module": "nodenext") for code Node runs directly. Migrate doesn\'t make this edit because it can change how other imports resolve.',
      lint: [],
      guide: `${MIGRATION_GUIDE}#typescript-jsx-solid-js--renderer-package`,
    });
  }
  return findings;
}

/**
 * The findings for one JSON Babel config (.babelrc, .babelrc.json,
 * babel.config.json), which no jssg rule can parse: each babel-preset-solid
 * entry in a presets list, with what migrate does about it
 * (`shared/babel.mjs`). tooling/build-config reports the same preset in
 * JavaScript configs.
 */
export function babelConfigFindings(file, text) {
  const bumped = bumpBabelConfig(text);
  if (bumped === null) return [];
  const entries = [...bumped.moved.map((site) => ({ ...site, reason: null })), ...bumped.left];
  return entries.map(({ line, column, reason }) => ({
    rule: "tooling/build-config",
    file,
    line,
    column,
    severity: "build",
    headline: "Replace the babel-preset-solid preset with the @solidjs/babel-plugin plugin.",
    why: "babel-preset-solid compiles JSX for Solid 1. Its Solid 2 successor, @solidjs/babel-plugin 2.0.2, is a Babel plugin, not a preset, so it goes in plugins, and it emits code for @solidjs/web.",
    guidance: reason === null
      ? 'Remove this preset, add "@solidjs/babel-plugin" to plugins with the same options, and swap the package in package.json; migrate makes both edits.'
      : `Remove this preset, add "@solidjs/babel-plugin" to plugins, and swap the package in package.json. Migrate swaps the package but leaves this config, because ${reason}.`,
    lint: [],
    guide: `${MIGRATION_GUIDE}#imports-where-things-live-now`,
  }));
}

/**
 * Parses a JSON file that may carry comments and trailing commas (tsconfig
 * does); returns undefined when it still doesn't parse.
 */
export function parseJsonLike(text) {
  if (typeof text !== "string") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text
      .replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match, string) => string ?? "")
      .replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(stripped);
    } catch {
      return undefined;
    }
  }
}
