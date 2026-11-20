/**
 * What a Solid 1.x application's common dependencies become on Solid 2,
 * verified on 2026-11-19, the day solid-js 2.0.3 became npm `latest`, against
 * published npm manifests (dist-tags and peerDependencies, and for the
 * blocked entries the imports in each tarball), never against peer ranges
 * alone: several packages declare open or wildcard Solid peers while
 * importing `solid-js/web` or `splitProps`, which Solid 2 does not export.
 *
 * Each entry names the package, a `legacy` test on the declared range (true
 * when the range is still on the Solid 1 line; `null` means every range is
 * legacy because the package has no Solid 2 line), a `status`, and the user
 * guidance. Statuses:
 *
 * - `upgrade`: the package has a Solid 2 release, under `latest` or a
 *   prerelease tag;
 * - `replace`: the package has no Solid 2 line and a different package (or
 *   a core API) takes its place;
 * - `use-core`: Solid 2 core now provides what the package provided;
 * - `blocked`: no Solid 2 release was found, so the dependency blocks the
 *   migration until it ships one or is replaced.
 *
 * A `replace` entry with `rename: true` is the same package under a new
 * name: migrate swaps it for `replacement` in package.json, and reports the
 * config or import edits that go with it.
 *
 * The launcher reports one finding per declared entry, located at the
 * dependency's line in package.json. Re-verify this table the same way:
 * read the manifests, not the ranges.
 */
export const DEPENDENCY_VERIFIED_ON = "2026-11-19";

const major = (pattern) => (range) => pattern.test(range);

export const DEPENDENCY_MAP = Object.freeze([
  {
    name: "@solidjs/router",
    legacy: major(/(^|[^0-9.])(0|1)\./),
    status: "upgrade",
    replacement: "@solidjs/router@2.0.0",
    guidance:
      "Install @solidjs/router@2.0.0, now npm latest (the Solid 1 router moved to the v1-latest tag, 1.0.3). The 2.0 router replaces <Router>/<Route> trees with createRouter({ routes }), <A> with plain <a>, and createAsync with async createMemo; this analyzer reports each such import.",
  },
  {
    name: "@solidjs/meta",
    legacy: major(/(^|[^0-9.])0\./),
    status: "use-core",
    replacement: "useHead from @solidjs/web (optionally @solidjs/meta@2.0.0)",
    guidance:
      "Solid 2 ships head management in core: useHead from @solidjs/web, with no provider. @solidjs/meta@2.0.0 (npm latest) remains available as a thin component layer over it (Title, Meta, Link without MetaProvider); 0.29.x is the Solid 1 version.",
  },
  {
    name: "@solidjs/start",
    legacy: null,
    status: "replace",
    replacement: "@solidjs/vite-plugin@3.0.1 with start mode",
    guidance:
      "No release of @solidjs/start targets Solid 2: its latest, 2.2.3, still requires solid-js ^1.9.15. Remove it and enable start mode with solid({ start: {...}, ssr: true }) from @solidjs/vite-plugin, plus fileRoutes() from filesystem-routing/vite for file routes; this analyzer reports each @solidjs/start import with its replacement.",
  },
  {
    name: "vinxi",
    legacy: null,
    status: "replace",
    replacement: "vite ^8 || ^9 with @solidjs/vite-plugin",
    guidance:
      "Solid 2 apps run on plain Vite 8 or 9 with @solidjs/vite-plugin, so remove vinxi and app.config.ts, and change vinxi dev / build / start scripts to vite, vite build, and the plugin's node server or vite preview.",
  },
  {
    name: "solid-start",
    legacy: null,
    status: "replace",
    replacement: "@solidjs/vite-plugin@3.0.1 with start mode",
    guidance:
      "The old solid-start package (0.x) has no Solid 2 release; replace it with @solidjs/vite-plugin start mode.",
  },
  {
    name: "vite-plugin-solid",
    legacy: null,
    status: "replace",
    replacement: "@solidjs/vite-plugin@3.0.1",
    rename: true,
    guidance:
      "vite-plugin-solid was renamed to @solidjs/vite-plugin. Install @solidjs/vite-plugin@3.0.1 (npm latest) and change the vite.config import; it requires Vite 8 or 9 and Node 22.12 or newer. Its default export is still the plugin factory and solid() needs no options; include, exclude, dev, ssr and extensions keep their meaning, hot is gone (HMR is the refresh option), the solid compiler options changed, and the babel option now needs @babel/core installed. Migrate makes both edits and reports the options to check.",
  },
  {
    name: "babel-preset-solid",
    legacy: null,
    status: "replace",
    replacement: "@solidjs/babel-plugin@2.0.2",
    rename: true,
    guidance:
      "Replace babel-preset-solid with @solidjs/babel-plugin@2.0.2 (npm latest), which is a Babel plugin rather than a preset: change presets: [\"solid\"] (or \"babel-preset-solid\") to plugins: [\"@solidjs/babel-plugin\"] in the Babel config, or rely on @solidjs/vite-plugin, which compiles JSX with @solidjs/compiler. babel-preset-solid's own next tag is a stale 2.0.0-rc.2. Migrate swaps the package and moves the preset to plugins in each Babel config where its options carry over unchanged; it reports the configs it leaves.",
  },
  ...[
    ["esbuild-plugin-solid", "0.6.0"],
    ["tsup-preset-solid", "2.2.0"],
    ["rollup-preset-solid", "3.0.0"],
  ].map(([name, latest]) => ({
    name,
    legacy: null,
    status: "replace",
    replacement: "a build step that runs @solidjs/babel-plugin@2.0.2",
    guidance: `${name} ${latest} (npm latest) compiles with babel-preset-solid 1.x, which emits Solid 1 code. Build with @solidjs/vite-plugin (Vite library mode), or keep this bundler and run @solidjs/babel-plugin@2.0.2 through its Babel hook, and set jsxImportSource or the plugin's moduleName to @solidjs/web.`,
  })),
  {
    name: "@solidjs/testing-library",
    legacy: (range) => !/(^|[^0-9.])1\.0\.0-/.test(range),
    status: "upgrade",
    replacement: "@solidjs/testing-library@1.0.0-rc.2",
    guidance:
      "Install @solidjs/testing-library@next (1.0.0-rc.2, which peers on solid-js and @solidjs/web 2.x; npm latest 0.8.x is the Solid 1 line) and set the test environment to jsdom yourself, since @solidjs/vite-plugin no longer sets it.",
  },
  {
    name: "solid-testing-library",
    legacy: null,
    status: "replace",
    replacement: "@solidjs/testing-library@1.0.0-rc.2",
    rename: true,
    guidance: "solid-testing-library is the old name of @solidjs/testing-library; replace it with @solidjs/testing-library@1.0.0-rc.2 (the Solid 2 line) and change its imports. Migrate makes both edits; set the test environment to jsdom yourself, since @solidjs/vite-plugin no longer sets it.",
  },
  {
    name: "@solid-primitives/storage",
    legacy: major(/(^|[^0-9.])[0-4]\./),
    status: "upgrade",
    replacement: "@solid-primitives/storage@5.0.0",
    guidance: "Install @solid-primitives/storage@5.0.0 (npm latest), the Solid 2 line.",
  },
  {
    name: "@solid-primitives/event-listener",
    legacy: major(/(^|[^0-9.])[0-2]\./),
    status: "upgrade",
    replacement: "@solid-primitives/event-listener@3.0.0",
    guidance: "Install @solid-primitives/event-listener@3.0.0 (npm latest), the Solid 2 line.",
  },
  {
    name: "@solid-primitives/media",
    legacy: major(/(^|[^0-9.])[0-3]\./),
    status: "upgrade",
    replacement: "@solid-primitives/media@4.0.0",
    guidance: "Install @solid-primitives/media@4.0.0 (npm latest), the Solid 2 line.",
  },
  {
    name: "@solid-primitives/scheduled",
    legacy: major(/(^|[^0-9.])[01]\./),
    status: "upgrade",
    replacement: "@solid-primitives/scheduled@2.0.0",
    guidance: "Install @solid-primitives/scheduled@2.0.0 (npm latest), the Solid 2 line.",
  },
  {
    name: "@tanstack/solid-query",
    legacy: major(/(^|[^0-9.])[0-5]\./),
    status: "upgrade",
    replacement: "@tanstack/solid-query@6.0.0-rc.6",
    guidance:
      "Install @tanstack/solid-query@rc (6.0.0-rc.6), the Solid 2 major; npm latest 5.x still targets Solid 1.",
  },
  {
    name: "@tanstack/solid-router",
    legacy: major(/(^|[^0-9.])[01]\./),
    status: "upgrade",
    replacement: "@tanstack/solid-router@2.0.0-rc.11",
    guidance:
      "Install @tanstack/solid-router@rc (2.0.0-rc.11, which peers on solid-js >=2.0.1); npm latest 1.x still targets Solid 1. Expect npm peer warnings because it still depends on Solid 1 helper packages (@solidjs/meta 0.29, @solid-primitives/refs 1.x, @solid-devtools/logger 0.9).",
  },
  {
    name: "solid-icons",
    legacy: major(/(^|[^0-9.])[01]\./),
    status: "upgrade",
    replacement: "solid-icons@2.0.0",
    guidance:
      "Install solid-icons@2.0.0 (npm latest), which supports Solid 1 and 2: it ships JSX source that your Solid 2 compiler builds and imports only solid-js. 1.x imports solid-js/web, which Solid 2 does not export.",
  },
  ...[
    ["@kobalte/core", "its only Solid 2 build, 2.0.0-alpha.4, pins solid-js and @solidjs/web to exactly 2.0.0-rc.16 and will not install with Solid 2.0.3"],
    ["@tanstack/solid-form", "its 2.0.0-alpha.3 still imports mergeProps and splitProps, which Solid 2 removes"],
    ["@tanstack/solid-virtual", "it imports solid-js/store, createComputed, and onMount, which Solid 2 removes"],
    ["@tanstack/solid-table", "its open peer range is misleading: it imports solid-js/web, batch, createComputed, and observable"],
    ["@modular-forms/solid", "it imports solid-js/web, batch, mergeProps, and splitProps"],
    ["@felte/solid", "it only declares solid-js ^1.2.0"],
    ["solid-transition-group", "it only declares solid-js ^1.6.12; @solid-primitives/transition-group@2.0.0 is a lower-level alternative, not a drop-in"],
  ].map(([name, reason]) => ({
    name,
    legacy: null,
    status: "blocked",
    replacement: null,
    guidance: `No Solid 2 release of ${name} was found on npm as of ${DEPENDENCY_VERIFIED_ON}: ${reason}. It blocks the migration until it ships one or is replaced; check its latest, next, alpha, beta, and rc tags again before migrating.`,
  })),
]);

/** The headline for a dependency finding, distinct per status so severity can classify it. */
export function dependencyHeadline(entry) {
  switch (entry.status) {
    case "upgrade":
      return `Move ${entry.name} to its Solid 2 line.`;
    case "replace":
      return `Replace ${entry.name} with its Solid 2 successor.`;
    case "use-core":
      return `Move ${entry.name} usage to Solid 2 core.`;
    default:
      return `Resolve ${entry.name}, which has no Solid 2 release yet.`;
  }
}
