# Solid Migration Assistant

Solid Migration Assistant is an experimental Solid 1.9 → Solid 2 migration assistant targeting Solid `2.0.0-rc.21` (upstream commit [`2105ffb8`](https://github.com/solidjs/solid/tree/2105ffb8ca2fced55f5fac0763177fc93f97c2c2), the newest published RC, available on npm under the `next` dist-tag while `latest` still resolves to Solid 1.9). It ships two workflows: a read-only `analyze` workflow that prints guidance for supported migration sites, and a deterministic `transform` workflow that relocates a small, pure subset of legacy import subpaths, relocates `solid-js/web` statements whose complete named binding set is proven compatible, and applies four narrow, provably equivalent JSX rewrites: intrinsic `classList` attributes to `class`, same-file `Context.Provider` elements to the context itself, `Index` elements to `For keyed={false}`, and lowercase `on*` handlers on intrinsic elements to their camelCase spellings.

The assistant scans project-owned `.js`, `.jsx`, `.ts`, and `.tsx` source, prints one detailed guidance string for each supported detection, and exits successfully when migration work is found. Each of the 38 named analyzers is a separate JSSG entrypoint and sequential workflow step; the workflow is the only production composition layer. Guidance is accumulated across those steps, sorted deterministically, and printed to standard output; the Codemod runtime's progress lines and the final disclosure are written to standard error. The analyzer never edits the target and does not generate reports, dashboards, or other output there. Codemod analytics are disabled. Codemod may persist workflow and task state in normal platform user-data directories outside the target; the assistant does not redirect or remove that runtime state.

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

**Imports** — `solid-js/web`, store, renderer, and JSX-runtime subpath repackaging.
**JSX** — component renames (`Suspense`/`Loading`, `ErrorBoundary`/`Errored`, `Index`/`For keyed=false`, `SuspenseList`/`Reveal`), `classList` removal, DOM attribute/event namespace removal (`attr:`, `bool:`, `on:`, `oncapture:`), lowercase `on*` handlers becoming plain attributes, `use:` directive removal, and `Context.Provider` → direct context syntax.
**Reactivity & lifecycle** — `createComputed`, `createEffect`, `createMemo`, `batch`, `createResource`, `on`, `onError`/`catchError`/`resetErrorBoundaries`, `startTransition`/`useTransition`/`createDeferred` (which keeps its name with a new meaning), `createSelector`/`indexArray`, `createDynamic`/`from`/`observable` (`from` now returns an async iterable for a memo), `onCleanup` ownership review, and `equalFn`/`getListener`/`writeSignal`/`enableScheduling`.
**Props & store** — `mergeProps`/`splitProps`, `onMount`, `unwrap`, `produce`, and `createMutable`/`modifyMutable`.
Coverage is deliberately limited. Even when no guidance is printed, review the documented exclusions and perform the application's normal type, build, and behavior validation; a clean analyzer run is not a readiness result.

## Transform

The opt-in `transform` workflow applies six deterministic rewrites in place and changes nothing else. Each rule is a separate JSSG entrypoint and sequential workflow step, so later rules see the output of earlier rules. The rules operate on disjoint syntax, and the combined workflow remains covered by exact-output and idempotency tests, including a fixture in which all six rules edit one file in a single pass.

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

The `classList` rule renames `classList` to `class` on an intrinsic JSX element whose only class source is one `classList` expression — `<div id="first" classList={flags} />` becomes `<div id="first" class={flags} />` — changing only the attribute name and leaving the value expression byte-identical. Solid 2 folds `classList` into `class`, whose object form applies the same class tokens Solid 1.x applied, which makes that rename an equivalence. Every less certain case is left to the analyzer's manual-review guidance: components, member components, and namespaced element names; elements with any other class source (including the `class="card"` plus `classList={…}` merge into the array form); elements with a spread attribute; duplicate `classList` attributes; shorthand, string, empty, and comment-only values; and near-miss attribute names. See [`codemods/solid-migration-assistant/README.md`](codemods/solid-migration-assistant/README.md) for the full list.

### Same-file `Context.Provider` → `Context`, `Index` → `For keyed={false}`, lowercase `on*` → camelCase

Three further rules cover syntax that rc.21 removed outright. `createContext()` now returns the provider component itself and `Context.Provider` is `undefined`, so `<Theme.Provider value="dark">…</Theme.Provider>` becomes `<Theme value="dark">…</Theme>`, but only when the context is declared in the same file as a `const` initialized by the file's single `createContext` import from `solid-js`, is bound nowhere else, and the element carries exactly one `value` attribute and no spread. `Index` is removed and `For keyed={false}` takes the same `each`, `fallback`, and `(item accessor, numeric index)` callback, so every `<Index>` tag in a file becomes `<For keyed={false}>` and the import specifier is renamed or removed, but only when every `Index` and `For` identifier in the file is accounted for and every element carries only `each`/`fallback`; one unsupported element leaves the whole file unchanged. Lowercase `on*` names such as `onclick`, which Solid 1.x bound exactly like `onClick`, are plain attributes in Solid 2, so they are renamed to the camelCase spelling declared by the rc.21 JSX types on intrinsic elements only, with a single-expression value, no spread, and no second attribute targeting the same event. See [`codemods/solid-migration-assistant/README.md`](codemods/solid-migration-assistant/README.md) for each rule's full exclusion list.

All six rules emit one per-edit report line (`file:line:column`, what changed, plus the migration-guide link). The workflow is idempotent and writes no report files or other artifacts in the target. It deliberately leaves `solid-js/store` (whose `createStore` setter semantics changed), already-migrated paths, and near-miss subpaths such as `solid-js/h-extra`, `vendor/solid-js/h`, and `solid-js/web/storage` untouched.

In this repository, run `pnpm transform` against the current directory, or invoke the Codemod CLI directly to target another directory:

```sh
node ./node_modules/codemod/codemod --disable-analytics workflow run -w transform.yaml -t /path/to/a/solid-project --allow-dirty --no-interactive
```

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

Verification runs comprehensive analysis and transformation rule fixtures plus end-to-end analyzer and transform fixtures; it checks exact ordered guidance, proves the analyzer leaves every target file unchanged, and proves the transform is idempotent and changes nothing outside the relocated module strings and the qualifying JSX names. `pnpm --dir codemods/solid-migration-assistant test:rc-compat` additionally installs the exact pinned rc.21 packages (network and Node 22.12+ required) and typechecks, compiles, and server-renders the transformed fixture against them.

See [`codemods/solid-migration-assistant/README.md`](codemods/solid-migration-assistant/README.md) for rule boundaries. Feedback is collected through ordinary [public GitHub issues](https://github.com/devagrawal09/solid-migration-assistant/issues/new).

Broader automated migrations remain a possible future roadmap item. The project is licensed under the [MIT License](LICENSE).
