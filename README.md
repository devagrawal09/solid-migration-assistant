# Solid Migration Assistant

Solid Migration Assistant is an experimental Solid 1.9 → Solid 2 migration assistant targeting Solid `2.0.3` (upstream commit [`68406c20`](https://github.com/solidjs/solid/tree/68406c2077eff22c67f71db4a16bf7026ddceee1), npm `latest` since 2026-11-19). It ships one Codemod v2 workflow, `workflow.ts`, with two modes: a read-only `analyze` mode that prints guidance for supported migration sites, and a deterministic `migrate` mode that runs twelve narrow rules: it relocates a small, pure subset of legacy import subpaths, relocates `solid-js/web` statements whose complete named binding set is proven compatible, relocates sole-specifier `JSX` type imports and `@jsxImportSource` pragmas to `@solidjs/web`, moves the imports of packages Solid 2 renamed (`vite-plugin-solid` to `@solidjs/vite-plugin`, `solid-testing-library` to `@solidjs/testing-library`) and a build tool's `jsxImportSource` option, rewrites literal store path setters to draft writes and simple `createEffect(on(dep, fn))` effects to split effects, and applies six provably equivalent JSX rewrites: React-style attribute names to the lowercase attribute Solid 1 set, boolean values on `aria-*`, `data-*` and true/false attributes to the text Solid 1 rendered, intrinsic `classList` attributes to `class` (including the literal `class` plus object `classList` merge with disjoint keys), `Context.Provider` elements to the context itself (proven in the same file or, through the workspace semantic provider, in the project file the context is imported from), `Index` elements to `For keyed={false}`, and lowercase `on*` handlers on intrinsic elements to their camelCase spellings. It then moves `package.json` and `tsconfig.json` to Solid 2 (including swapping renamed packages), installs (only the changed packages of a workspace), and typechecks, after checking that `solid-js` resolves to the Solid 2 copy it installed.

The assistant scans project-owned `.js`, `.jsx`, `.ts`, and `.tsx` source, returns one structured finding (rule, location, severity, headline, why, guidance, lint rules, and guide link) for each supported detection, and exits successfully when migration work is found. Each named analyzer is a separate JSSG entrypoint and sequential workflow step. The workflow reads the project's dependencies first, skips stages whose packages the project does not use, pauses for approval when a dependency has no Solid 2 release, and finishes with eslint-plugin-solid's Solid 2 config; its step table is generated from the rule folders. Findings are accumulated across those steps and rendered only at the edges: the text report prints them in location order, each tagged with its severity, followed by a per-headline summary with counts and sites, grouped by severity (will not build, behaves differently, deprecated); `--format json` prints the same findings as one JSON document of those fields, and `--format agent` prints them as a fix-ordered Markdown work list for a coding agent; the Codemod runtime's progress lines and the final disclosure are written to standard error. The analyzer never edits the target and does not generate reports, dashboards, or other output there. Codemod analytics are disabled. Codemod may persist workflow and task state in normal platform user-data directories outside the target; the assistant does not redirect or remove that runtime state.

## Run the analyzer and transform

> **Scope:** version `0.4.3` targets Solid `2.0.3` and covers only the detections and rewrites documented below. A clean analyzer run is not proof that a project is ready for Solid 2.

Run it from the Codemod Registry with `codemod@alpha`, the Codemod 2.0 alpha CLI (`2.0.0-alpha.4` at this release); plain `codemod` / `codemod@latest` is still the 1.x CLI and cannot run workflow v2 packages. From the root of a Solid 1.9 project in a clean git checkout:

```sh
# Analyze (default): prints findings and changes nothing.
npx codemod@alpha run solid-migration-assistant

# Migrate: applies the rewrites, moves package.json and tsconfig.json to
# Solid 2, installs with the project's package manager and typechecks.
npx codemod@alpha run solid-migration-assistant --param mode=migrate
```

Add `--target <path>` to run on another directory, `--param verify=false` to skip the eslint-plugin-solid runs, and `--param install=false` to skip the install and typecheck after migrate. [The package README](codemods/solid-migration-assistant/README.md) documents every detection and rewrite.

### npm launcher

The npm launcher adds the `--format json` and `--format agent` reports and a dependency lookup. It is not yet published at this version: npm `latest` for `solid-migration-assistant` is still `0.2.1`, an older release that targets a Solid 2 release candidate, so use the Codemod Registry commands above until it is. Once it is published, run it from a project root with Node 20 or newer and npm (no pnpm installation is needed):

The assistant itself imposes no operating-system, CPU-architecture, or libc restriction in its npm metadata or launcher. Actual execution support depends on native runtime availability from the pinned Codemod 2.0.0-alpha.4 dependency and on the installing package manager and platform. This project does not claim that Codemod provides a working native runtime for every platform or architecture; installation or launch errors from Codemod remain authoritative.

```sh
npx --yes solid-migration-assistant@latest
```

The current directory is analyzed by default. To analyze another directory:

```sh
npx --yes solid-migration-assistant@latest --target /path/to/a/solid-project
```

The supported rules detect the complete Solid 2 migration quick rename / removal map:

**Imports** — `solid-js/web`, store, renderer, and JSX-runtime subpath repackaging, plus `JSX` type imports and `@jsxImportSource` pragmas moving to the renderer package.
**JSX** — component renames (`Suspense`/`Loading`, `ErrorBoundary`/`Errored`, `Index`/`For keyed=false`, `SuspenseList`/`Reveal`), `classList` removal, DOM attribute/event namespace removal (`attr:`, `bool:`, `on:`, `oncapture:`), lowercase `on*` handlers becoming plain attributes, `use:` directive removal, and `Context.Provider` → direct context syntax.
**Reactivity & lifecycle** — `createComputed`, `createEffect`, `createMemo`, `batch`, `createResource`, `on`, `onError`/`catchError`/`resetErrorBoundaries`, `startTransition`/`useTransition`/`createDeferred` (which keeps its name with a new meaning), `createSelector`/`indexArray`, `createDynamic`/`from`/`observable` (`from` now returns an async iterable for a memo), `onCleanup` ownership review, and `equalFn`/`getListener`/`writeSignal`/`enableScheduling`.
**Props & store** — `mergeProps`/`splitProps`, `onMount`, `unwrap`, `produce`, `createMutable`/`modifyMutable`, and every 1.x store setter call shape that the draft-only 2.0 setter no longer accepts.
**Ownership** — inline ref callbacks doing owner-dependent work, nested `createRoot` calls, and deprecated `<Dynamic>` elements.
**Project files** — the launcher reads `package.json` and `tsconfig.json` and reports a Solid 1 `solid-js` range, a missing `@solidjs/web`, a `solid-js` `jsxImportSource`, and each common Solid 1 dependency with its verified Solid 2 counterpart or the fact that none exists yet.
**Ecosystem imports** — Solid 1 imports from `@solidjs/router`, `@solidjs/meta`, `@solidjs/start`, and `vinxi`, each with its audited Solid 2 replacement.
Coverage is deliberately limited. Even when no guidance is printed, review the documented exclusions and perform the application's normal type, build, and behavior validation; a clean analyzer run is not a readiness result.

## Transform

The opt-in `transform` workflow applies nine deterministic rewrites in place and changes nothing else. Each rule is a separate JSSG entrypoint and sequential workflow step, so later rules see the output of earlier rules. The rules operate on disjoint syntax, and the combined workflow remains covered by exact-output and idempotency tests, including a fixture in which all six rules edit one file in a single pass.

### Literal store setters and simple `on()` effects

`setStore("user", "name", "Ann")` with literal path segments and a literal value becomes a draft write (`undefined` becomes `delete`), and the `solid-js/store` import moves to `solid-js` once every setter in the file is rewritten and none is exported; `createEffect(on(dep, fn))` with a provable signal or memo dependency (including a memo imported from another project file) and a side-effect-only callback becomes `createEffect(() => dep(), fn)`, and the `on` import is removed. Both are proven against Solid 1.9.13 and 2.0.1 at runtime by `test:rc-compat`. See the package README for the exact conditions.

### JSX type imports and pragmas

An import statement whose only specifier is the type `JSX` from `solid-js`, and a `@jsxImportSource solid-js` comment pragma, move to `@solidjs/web`; a type-only `JSX` specifier in a mixed statement is split into its own `@solidjs/web` import; and a type-only `JSXElement` import becomes `JSX` from `@solidjs/web` with its references rewritten to `JSX.Element` when the file binds no other `JSX`. Value imports, aliased `JSXElement`, and `tsconfig.json` are reported by the analyzer instead.

### Pure subpath relocations

Five subpaths move wholesale:

- `solid-js/h` → `@solidjs/h`
- `solid-js/html` → `@solidjs/html`
- `solid-js/universal` → `@solidjs/universal`
- `solid-js/jsx-runtime` → `@solidjs/web/jsx-runtime`
- `solid-js/jsx-dev-runtime` → `@solidjs/web/jsx-dev-runtime`

This rule covers static imports, re-exports, dynamic `import()`, and `require()` calls, and preserves each reference's import form and quote style. Every one of these moves is a pure package relocation with no removed, renamed, or behaviorally changed export, so no binding-level review is required for these five paths.

### Binding-gated `solid-js/web` → `@solidjs/web`

`solid-js/web` is **not** a pure relocation. Between the published `solid-js@1.9.13` and `@solidjs/web@2.0.3` builds, `createDynamic`, `Index`, `Hydration`, `NoHydration`, `renderToStringAsync`, `ssrClassList`, `ssrSpread`, `pipeToNodeWritable`, and a dozen smaller helpers are gone; `Suspense`, `ErrorBoundary`, `SuspenseList`, and `mergeProps` are no longer re-exported for application code (`Loading`, `Errored`, `Reveal`, and `merge` replace them); `Portal` lost `useShadow`, `isSVG`, and `ref`; and `isDev` is no longer pinned to `false` on the server entry. A separate default-deny rule therefore relocates a `solid-js/web` statement only when it is a named static import or a named re-export **and** every name it takes from the module is on this allowlist of bindings proven compatible across the move:

`Dynamic`, `hydrate`, `isServer`, `render`

`Dynamic` joined the list with Solid 2.0.0-rc.21: earlier release candidates described `<Dynamic>` in prose and compiler defaults but exported no such binding, so the rule refused it; at `68406c20` the web entry exports `Dynamic` with its 1.9 user-facing contract, and the migration guide states that existing `<Dynamic>` code keeps working while marking it **deprecated** (no runtime warning) in favor of `dynamic(source)`, which every report line that relocates it records. Every other name is vetoed, and a statement that mixes an allowed name with a vetoed one is left entirely unchanged. Namespace imports, default imports, side-effect imports, empty name lists, `export *`, `export * as`, `export { default as … }`, dynamic `import()`, `require()`, `import("solid-js/web").X` type queries, string-literal specifier names, and import attributes are all rejected outright. Aliases, inline `type` modifiers, and quote style survive untouched, and an escaped specifier such as `"solid-js\x2fweb"` is the same module, so it is eligible once its bindings pass.

Because this rule owns `solid-js/web` exclusively, the pure-subpath map above never contains it: a `solid-js/web` statement is relocated only after its bindings pass, never because its module string matched.

### Intrinsic JSX `classList` → `class`

The `classList` rule renames `classList` to `class` on an intrinsic JSX element whose only class source is one `classList` expression — `<div id="first" classList={flags} />` becomes `<div id="first" class={flags} />` — changing only the attribute name and leaving the value expression byte-identical, and merges a literal `class` string with an object-literal `classList` whose keys are disjoint from the static tokens into `class={["card", { … }]}`, the one combination the pinned 1.9 and 2.0.0 builds render identically on both DOM and SSR. Solid 2 folds `classList` into `class`, whose object form applies the same class tokens Solid 1.x applied, which makes that rename an equivalence. Every less certain case is left to the analyzer's manual-review guidance: components, member components, and namespaced element names; elements with any other class source (including the `class="card"` plus `classList={…}` merge into the array form); elements with a spread attribute; duplicate `classList` attributes; shorthand, string, empty, and comment-only values; and near-miss attribute names. See [`codemods/solid-migration-assistant/README.md`](codemods/solid-migration-assistant/README.md) for the full list.

### `Context.Provider` → `Context`, `Index` → `For keyed={false}`, lowercase `on*` → camelCase

Three further rules cover syntax that 2.0.0 removed outright. `createContext()` now returns the provider component itself and `Context.Provider` is `undefined`, so `<Theme.Provider value="dark">…</Theme.Provider>` becomes `<Theme value="dark">…</Theme>`, but only when the context is declared as a `const` initialized by its file's single `createContext` import from `solid-js` and is bound nowhere else, and the element carries exactly one `value` attribute and no spread. The declaration may be in the same file or in the project file the context is imported from, which the transform resolves through Codemod's workspace semantic provider and then proves syntactically; semantics are used only for such positive proofs. `Index` is removed and `For keyed={false}` takes the same `each`, `fallback`, and `(item accessor, numeric index)` callback, so every `<Index>` tag in a file becomes `<For keyed={false}>` and the import specifier is renamed or removed, but only when every `Index` and `For` identifier in the file is accounted for and every element carries only `each`/`fallback`; one unsupported element leaves the whole file unchanged. Lowercase `on*` names such as `onclick`, which Solid 1.x bound exactly like `onClick`, are plain attributes in Solid 2, so they are renamed to the camelCase spelling declared by the 2.0.0 JSX types on intrinsic elements only, with a single-expression value, no spread, and no second attribute targeting the same event. See [`codemods/solid-migration-assistant/README.md`](codemods/solid-migration-assistant/README.md) for each rule's full exclusion list.

All nine rules report each edit with its location, rule, what changed, and the migration-guide link. The workflow is idempotent and writes no report files or other artifacts in the target. It deliberately leaves `solid-js/store` (whose `createStore` setter semantics changed), already-migrated paths, and near-miss subpaths such as `solid-js/h-extra`, `vendor/solid-js/h`, and `solid-js/web/storage` untouched.

Run it through the launcher, which refuses a target whose git working tree is dirty or not a repository unless `--allow-dirty` is passed:

```sh
npx --yes solid-migration-assistant@latest transform --target /path/to/a/solid-project
```

In this repository, `pnpm transform` runs the same subcommand with `--allow-dirty` against the package directory.

When a dependency has no Solid 2 release, `transform` exits with status 2 and rewrites nothing; pass `--allow-blocked` to apply the source rewrites anyway. Run directly through Codemod, the same workflow takes `--param mode=migrate`.

## Verify the repository

```sh
pnpm install --frozen-lockfile
pnpm verify
```

Verification (also run by CI on every pull request) checks that the generated entrypoints, workflows, and packaged file list match `pnpm generate`, runs every rule against its colocated fixtures and the end-to-end analyzer and transform fixtures, compares their output with committed expected files (refresh them with `pnpm --dir codemods/solid-migration-assistant fixtures:update` and review the diff), proves the analyzer leaves every target file unchanged, and proves the transform is idempotent and changes nothing outside the relocated module strings and the qualifying JSX names. Before a release, `pnpm --dir codemods/solid-migration-assistant test:release` runs both network-dependent checks: the pinned-version compatibility check and the real-world corpus, whose per-project counts must match a reviewed baseline; it also fails when npm `latest` has moved past the pinned version. `pnpm --dir codemods/solid-migration-assistant test:rc-compat` on its own installs the exact pinned Solid 2 packages (network and Node 22.12+ required) and typechecks, compiles, and server-renders the transformed fixture against them. `pnpm --dir codemods/solid-migration-assistant test:corpus` (network required, not part of `verify`) clones the pinned open-source Solid 1.x projects listed in `tests/corpus/corpus.json` and proves that the analyzer leaves each one untouched, that the transform changes exactly the files it reports and every rewritten file still parses, and that a second transform run is a no-op.

See [`codemods/solid-migration-assistant/README.md`](codemods/solid-migration-assistant/README.md) for rule boundaries. Feedback is collected through ordinary [public GitHub issues](https://github.com/devagrawal09/solid-migration-assistant/issues/new).

Broader automated migrations remain a possible future roadmap item. The project is licensed under the [MIT License](LICENSE).
