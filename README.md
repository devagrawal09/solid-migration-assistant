# Solid Migration Assistant

Solid Migration Assistant is an experimental Solid 1.9 → Solid 2 migration assistant targeting Solid `2.0.0-rc.21` (upstream commit [`2105ffb8`](https://github.com/solidjs/solid/tree/2105ffb8ca2fced55f5fac0763177fc93f97c2c2), the newest published RC, available on npm under the `next` dist-tag while `latest` still resolves to Solid 1.9). It ships two workflows: a read-only `analyze` workflow that prints guidance for supported migration sites, and a deterministic `transform` workflow that relocates a small, pure subset of legacy import subpaths, relocates `solid-js/web` statements whose complete named binding set is proven compatible, relocates sole-specifier `JSX` type imports and `@jsxImportSource` pragmas to `@solidjs/web`, and applies six narrow, provably equivalent JSX rewrites: intrinsic `classList` attributes to `class` (including the literal `class` plus object `classList` merge with disjoint keys), `Context.Provider` elements to the context itself (proven in the same file or, through the workspace semantic provider, in the project file the context is imported from), `Index` elements to `For keyed={false}`, `Suspense` elements with at most an optional `fallback` to `Loading`, `ErrorBoundary` elements whose single `fallback` is provably non-function to `Errored`, and lowercase `on*` handlers on intrinsic elements to their camelCase spellings.

The assistant scans project-owned `.js`, `.jsx`, `.ts`, and `.tsx` source, returns one structured finding (rule, location, severity, headline, why, guidance, lint rules, and guide link) for each supported detection, and exits successfully when migration work is found. Each named analyzer is a separate JSSG entrypoint and sequential workflow step; the workflow is the only production composition layer, and its steps are generated from the rule folders. Findings are accumulated across those steps and rendered only at the edges: the text report prints them in location order, each tagged with its severity, followed by a per-headline summary with counts and sites, grouped by severity (will not build, behaves differently, deprecated); `--format json` prints the same findings as one JSON document of those fields, and `--format agent` prints them as a fix-ordered Markdown work list for a coding agent; the Codemod runtime's progress lines and the final disclosure are written to standard error. The analyzer never edits the target and does not generate reports, dashboards, or other output there. Codemod analytics are disabled. Codemod may persist workflow and task state in normal platform user-data directories outside the target; the assistant does not redirect or remove that runtime state.

## Run the RC analyzer and transform

> **RC scope:** version `0.4.0` targets Solid `2.0.0-rc.21` and covers only the detections and rewrites documented below. A clean analyzer run is not proof that a project is ready for Solid 2.

After npm publication, run the package from a project root with Node 20 or newer and npm (no pnpm installation is needed):

The assistant itself imposes no operating-system, CPU-architecture, or libc restriction in its npm metadata or launcher. Actual execution support depends on native runtime availability from the pinned Codemod 1.12.13 dependency and on the installing package manager and platform. This project does not claim that Codemod provides a working native runtime for every platform or architecture; installation or launch errors from Codemod remain authoritative.

```sh
npx --yes solid-migration-assistant@latest
```

The current directory is analyzed by default. To analyze another directory:

```sh
npx --yes solid-migration-assistant@latest --target /path/to/a/solid-project
```

The supported rules detect the complete Solid 2 RC migration quick rename / removal map:

**Imports** — `solid-js/web`, store, renderer, and JSX-runtime subpath repackaging, plus `JSX` type imports and `@jsxImportSource` pragmas moving to the renderer package.
**JSX** — component renames (`Suspense`/`Loading`, `ErrorBoundary`/`Errored`, `Index`/`For keyed=false`, `SuspenseList`/`Reveal`), `classList` removal, DOM attribute/event namespace removal (`attr:`, `bool:`, `on:`, `oncapture:`), lowercase `on*` handlers becoming plain attributes, removal of camelCase HTML/SVG attribute aliases (`tabIndex`, `readOnly`, `colSpan`, and 30 others) on intrinsic elements, `Portal` prop removal (`useShadow`, `isSVG`, `ref`), `use:` directive removal, and `Context.Provider` → direct context syntax.
**Reactivity & lifecycle** — `createComputed`, `createEffect` (one-argument calls split into compute and apply; two- and three-argument calls are reported only when the second argument is syntactically not a function expression, because an arrow or function second argument is already the Solid 2 apply callback), `createMemo`, `createSignal(fn)`/`createStore(fn)` as derived primitives, `batch`, `createResource`, `on`, `onError`/`catchError`/`resetErrorBoundaries`, `startTransition`/`useTransition`/`createDeferred` (which keeps its name with a new meaning), `createSelector`/`indexArray`, `createDynamic`/`from`/`observable` (`from` now returns an async iterable for a memo), `useContext` on a default-less context, `onCleanup` ownership review, and `equalFn`/`getListener`/`writeSignal`/`enableScheduling`.
**Props & store** — `mergeProps`/`splitProps`, `onMount`, `unwrap`, `produce`, `createMutable`/`modifyMutable`, and every 1.x store setter call shape that the draft-only 2.0 setter no longer accepts.
**Ownership** — inline ref callbacks doing owner-dependent work, nested `createRoot` calls, and deprecated `<Dynamic>` elements.
**Project files** — the launcher reads `package.json` and `tsconfig.json` and reports a Solid 1 `solid-js` range, a missing `@solidjs/web`, a `solid-js` `jsxImportSource`, and each common Solid 1 dependency with its verified Solid 2 counterpart or the fact that none exists yet.
**Ecosystem imports** — Solid 1 imports from `@solidjs/router`, `@solidjs/meta`, `@solidjs/start`, and `vinxi`, each with its audited Solid 2 replacement. When `package.json` already pins one of those ecosystem packages to its audited Solid 2 line (`@solidjs/router` `2.0.0-next.*`, `@solidjs/meta` `1.0.0-next.*`), the launcher drops every `imports/ecosystem-apis` finding for that package from each output format, because an application that has already moved to the Solid 2 line of that package is no longer importing the removed 1.x bindings; and when `package.json` declares `solid-js` on a 2.x range, the launcher adds one stderr line, next to the final disclosure, that says the project already declares Solid 2 and that this analyzer understands Solid 1 source, so any remaining findings are sites that still use Solid 1 APIs.
Coverage is deliberately limited. Even when no guidance is printed, review the documented exclusions and perform the application's normal type, build, and behavior validation; a clean analyzer run is not a readiness result.

## Transform

The opt-in `transform` workflow applies eleven deterministic rewrites in place and changes nothing else. Each rule is a separate JSSG entrypoint and sequential workflow step, so later rules see the output of earlier rules. The rules operate on disjoint syntax, and the combined workflow remains covered by exact-output and idempotency tests, including fixtures in which every JSX rule edits one file in a single pass.

### Literal store setters and simple `on()` effects

`setStore("user", "name", "Ann")` with literal path segments and a literal value becomes a draft write (`undefined` becomes `delete`), and the `solid-js/store` import moves to `solid-js` once every setter in the file is rewritten and none is exported; `createEffect(on(dep, fn))` with a provable signal or memo dependency (including a memo imported from another project file) and a side-effect-only callback becomes `createEffect(() => dep(), fn)`, and the `on` import is removed. Both are proven against Solid 1.9.13 and rc.21 at runtime by `test:rc-compat`. See the package README for the exact conditions.

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

`solid-js/web` is **not** a pure relocation. Between the published `solid-js@1.9.13` and `@solidjs/web@2.0.0-rc.21` builds, `createDynamic`, `Index`, `Hydration`, `NoHydration`, `renderToStringAsync`, `ssrClassList`, `ssrSpread`, `pipeToNodeWritable`, and a dozen smaller helpers are gone; `Suspense`, `ErrorBoundary`, `SuspenseList`, and `mergeProps` are no longer re-exported for application code (`Loading`, `Errored`, `Reveal`, and `merge` replace them); `Portal` lost `useShadow`, `isSVG`, and `ref`; and `isDev` is no longer pinned to `false` on the server entry. A separate default-deny rule therefore relocates a `solid-js/web` statement only when it is a named static import or a named re-export **and** every name it takes from the module is on this allowlist of bindings proven compatible across the move:

`Dynamic`, `hydrate`, `isServer`, `render`

`Dynamic` joined the list with rc.21: earlier RCs described `<Dynamic>` in prose and compiler defaults but exported no such binding, so the rule refused it; at `2105ffb8` the web entry exports `Dynamic` with its 1.9 user-facing contract, and the migration guide states that existing `<Dynamic>` code keeps working while marking it **deprecated** (no runtime warning) in favor of `dynamic(source)`, which every report line that relocates it records. Every other name is vetoed, and a statement that mixes an allowed name with a vetoed one is left entirely unchanged. Namespace imports, default imports, side-effect imports, empty name lists, `export *`, `export * as`, `export { default as … }`, dynamic `import()`, `require()`, `import("solid-js/web").X` type queries, string-literal specifier names, and import attributes are all rejected outright. Aliases, inline `type` modifiers, and quote style survive untouched, and an escaped specifier such as `"solid-js\x2fweb"` is the same module, so it is eligible once its bindings pass.

Because this rule owns `solid-js/web` exclusively, the pure-subpath map above never contains it: a `solid-js/web` statement is relocated only after its bindings pass, never because its module string matched.

### Intrinsic JSX `classList` → `class`

The `classList` rule renames `classList` to `class` on an intrinsic JSX element whose only class source is one `classList` expression — `<div id="first" classList={flags} />` becomes `<div id="first" class={flags} />` — changing only the attribute name and leaving the value expression byte-identical, and merges a literal `class` string with an object-literal `classList` whose keys are disjoint from the static tokens into `class={["card", { … }]}`, the one combination the pinned 1.9 and rc.21 builds render identically on both DOM and SSR. Solid 2 folds `classList` into `class`, whose object form applies the same class tokens Solid 1.x applied, which makes that rename an equivalence. Every less certain case is left to the analyzer's manual-review guidance: components, member components, and namespaced element names; elements with any other class source (including the `class="card"` plus `classList={…}` merge into the array form); elements with a spread attribute; duplicate `classList` attributes; shorthand, string, empty, and comment-only values; and near-miss attribute names. See [`codemods/solid-migration-assistant/README.md`](codemods/solid-migration-assistant/README.md) for the full list.

### `Context.Provider` → `Context`, `Index` → `For keyed={false}`, `Suspense` → `Loading`, `ErrorBoundary` → `Errored`, lowercase `on*` → camelCase

Five further rules cover syntax that rc.21 removed outright. `createContext()` now returns the provider component itself and `Context.Provider` is `undefined`, so `<Theme.Provider value="dark">…</Theme.Provider>` becomes `<Theme value="dark">…</Theme>`, but only when the context is declared as a `const` initialized by its file's single `createContext` import from `solid-js` and is bound nowhere else, and the element carries exactly one `value` attribute and no spread. The declaration may be in the same file or in the project file the context is imported from, which the transform resolves through Codemod's workspace semantic provider and then proves syntactically; semantics are used only for such positive proofs. `Index` is removed and `For keyed={false}` takes the same `each`, `fallback`, and `(item accessor, numeric index)` callback, so every `<Index>` tag in a file becomes `<For keyed={false}>` and the import specifier is renamed or removed, but only when every `Index` and `For` identifier in the file is accounted for and every element carries only `each`/`fallback`; one unsupported element leaves the whole file unchanged. `Suspense` is removed and `Loading` takes the same optional `fallback` and the same subtree-tracking behavior, so every `<Suspense>` tag in a file becomes `<Loading>` and the import specifier (from `solid-js` or the 1.9 `solid-js/web` re-export) is renamed or removed, but only when every element carries at most a `fallback` single-expression container, no spread, and no other attribute, and every `Loading` identifier is either an existing `solid-js` import or a JSX name. `ErrorBoundary` is removed and `Errored` has the same non-function `fallback` contract, so every `<ErrorBoundary>` tag whose `fallback` is a plain string or a `{<element-or-fragment>}` expression (never a function, identifier, call, or other value that could evaluate to a function at runtime, since `err` becomes an accessor in 2.0) becomes `<Errored>` with the specifier renamed or removed under the same import gating. Lowercase `on*` names such as `onclick`, which Solid 1.x bound exactly like `onClick`, are plain attributes in Solid 2, so they are renamed to the camelCase spelling declared by the rc.21 JSX types on intrinsic elements only, with a single-expression value, no spread, and no second attribute targeting the same event. See [`codemods/solid-migration-assistant/README.md`](codemods/solid-migration-assistant/README.md) for each rule's full exclusion list.

All eleven rules report each edit with its location, rule, what changed, and the migration-guide link. The workflow is idempotent and writes no report files or other artifacts in the target. It deliberately leaves `solid-js/store` (whose `createStore` setter semantics changed), already-migrated paths, near-miss subpaths such as `solid-js/h-extra`, `vendor/solid-js/h`, and `solid-js/web/storage`, every `Suspense` or `ErrorBoundary` site outside the rewritten subset (aliased imports, spreads, extra attributes, function fallbacks), and the `SuspenseList` → `Reveal` rename untouched.

Run it through the launcher, which refuses a target whose git working tree is dirty or not a repository unless `--allow-dirty` is passed:

```sh
npx --yes solid-migration-assistant@latest transform --target /path/to/a/solid-project
```

In this repository, `pnpm transform` runs the same subcommand with `--allow-dirty` against the package directory.

After publication, select the `transform` workflow from the Codemod platform (it is registered with `default: false`).

## Preliminary workspace-pass benchmark

Run the opt-in directional benchmark on the small checked-in fixture:

```sh
pnpm --dir codemods/solid-migration-assistant benchmark:workspace-passes
```

Pass `-- --target /path/to/project` to use another target. It compares one JSSG workspace-semantic step against the same step repeated to match the production analyzer-step count, then reports raw samples, medians, added cost, slowdown, and a marginal-pass estimate. Each pass forces reference resolution for one imported binding per source file, and relevant target source is hashed before and after. Each sample times a whole Codemod CLI invocation, so process startup dominates small targets. The probe does not reproduce the number or shape of semantic queries made by the real analyzers, compare complete old and new analyzer workflows, control caches, or model full rule traversal cost.

## Verify the repository

```sh
pnpm install --frozen-lockfile
pnpm verify
```

Verification (also run by CI on every pull request) checks that the generated entrypoints, workflows, and packaged file list match `pnpm generate`, runs every rule against its colocated fixtures and the end-to-end analyzer and transform fixtures, compares their output with committed expected files (refresh them with `pnpm --dir codemods/solid-migration-assistant fixtures:update` and review the diff), proves the analyzer leaves every target file unchanged, and proves the transform is idempotent and changes nothing outside the relocated module strings and the qualifying JSX names. Before a release, `pnpm --dir codemods/solid-migration-assistant test:release` runs both network-dependent checks: the pinned-RC compatibility check and the real-world corpus, whose per-project counts must match a reviewed baseline; it also fails when npm `next` has moved past the pinned RC. `pnpm --dir codemods/solid-migration-assistant test:rc-compat` on its own installs the exact pinned rc.21 packages (network and Node 22.12+ required) and typechecks, compiles, and server-renders the transformed fixture against them. `pnpm --dir codemods/solid-migration-assistant test:corpus` (network required, not part of `verify`) clones the pinned open-source Solid 1.x projects listed in `tests/corpus/corpus.json` and proves that the analyzer leaves each one untouched, that the transform changes exactly the files it reports and every rewritten file still parses, and that a second transform run is a no-op.

See [`codemods/solid-migration-assistant/README.md`](codemods/solid-migration-assistant/README.md) for rule boundaries. Feedback is collected through ordinary [public GitHub issues](https://github.com/devagrawal09/solid-migration-assistant/issues/new).

Broader automated migrations remain a possible future roadmap item. The project is licensed under the [MIT License](LICENSE).
