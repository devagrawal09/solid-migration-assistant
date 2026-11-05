# Solid Migration Assistant

This package implements Solid Migration Assistant as two workflows for a narrow Solid 1.9 client-application profile. The read-only `analyze` workflow runs each of 43 named analyzers as a separate JSSG entrypoint and sequential workflow step, prints one detailed, location-bearing guidance string per supported migration site, returns no edits, and writes no files. The `transform` workflow runs each of seven deterministic rules as its own sequential JSSG step: relocating sole-specifier `JSX` type imports and `@jsxImportSource` pragmas from `solid-js` to `@solidjs/web`, relocating a small, pure subset of legacy import subpaths, relocating `solid-js/web` statements whose complete named binding set is proven compatible, and rewriting four narrow, provably equivalent subsets of JSX syntax: intrinsic `classList` attributes to `class` (including the literal `class` plus object `classList` merge with disjoint keys), same-file `Context.Provider` elements to the context itself, `Index` elements to `For keyed={false}`, and lowercase `on*` event handlers on intrinsic elements to their camelCase spellings. The YAML workflows are the only production composition layer.

The migration target is pinned to Solid `2.0.0-rc.21` at upstream commit [`2105ffb8`](https://github.com/solidjs/solid/tree/2105ffb8ca2fced55f5fac0763177fc93f97c2c2), the `gitHead` recorded on npm for `solid-js@2.0.0-rc.21`, `@solidjs/web@2.0.0-rc.21`, `@solidjs/signals@2.0.0-rc.21`, `@solidjs/h@2.0.0-rc.21`, `@solidjs/html@2.0.0-rc.21`, `@solidjs/universal@2.0.0-rc.21`, and `@solidjs/babel-plugin@2.0.0-rc.21` (all published 2026-11-04 under the `next` dist-tag; `latest` still resolves to Solid 1.9). Every guidance string and report line links the migration guide at that commit; the version and commit live in one place, `shared/target.ts` (mirrored for the launcher's disclosure in `shared/run-workflow.mjs`), and `node tools/bump-target.mjs <version> <commit>` moves both plus every citation when a newer RC is published. The Solid 1.9 side of each comparison is `solid-js@1.9.13` (tag `v1.9.13`), whose `solid-js/web` export surface is identical to `1.9.18`, the current `latest`.

## Analyze with npm

> **RC scope:** version `0.4.0` targets Solid `2.0.0-rc.21` and implements only the detections and rewrites documented below. A clean run is not proof that a project is ready for Solid 2.

After npm publication, run this from the project root with Node 20 or newer and npm (pnpm is not required):

The assistant itself imposes no operating-system, CPU-architecture, or libc restriction in its npm metadata or launcher. Actual execution support depends on native runtime availability from the pinned Codemod 1.12.13 dependency and on the installing package manager and platform. This project does not claim that Codemod provides a working native runtime for every platform or architecture; installation or launch errors from Codemod remain authoritative.

```sh
npx --yes solid-migration-assistant@latest
```

The current directory is the default target. An explicit target may be absolute or relative to the current directory:

```sh
npx --yes solid-migration-assistant@latest --target /path/to/a/solid-project
```

Before the workflow runs, the launcher itself reads `package.json` and `tsconfig.json` in the target (never writing either) and prints a finding when `solid-js` is declared at a Solid 1 range, `@solidjs/web` is missing, `babel-preset-solid` or `vite-plugin-solid` is declared, or `jsxImportSource` is `solid-js`; these two files sit outside the JSSG analyzers' JavaScript and TypeScript surface, and the guidance mirrors the official `solid-v2` templates. A run with detections exits successfully. Complete opaque guidance strings are exact-deduplicated, sorted lexically as whole strings, and printed once to standard output as a terminal aggregate, followed by a summary tail: the total number of findings and files, then for each distinct headline its count and the sorted `file:line:column` sites, so a long run can be surveyed before reading every paragraph. The transform workflow prints the same kind of tail after its report lines. The Codemod runtime's progress lines and the final disclosure are written to standard error. To capture the findings in a file, redirect standard output: `npx --yes solid-migration-assistant@latest --target . > report.txt`; to also capture progress and the disclosure, redirect both streams: `npx --yes solid-migration-assistant@latest --target . > report.txt 2>&1`. The analyzer does not edit the target or create persistent output there, and Codemod analytics are disabled. Codemod may persist workflow and task state in normal platform user-data directories outside the target; the assistant does not redirect or remove that runtime state.

## Supported detections

### Imports
- **Solid web package imports** — static ES imports from `solid-js/web` → `@solidjs/web`.
- **JSX type imports** — `JSX` and `JSXElement` type specifiers from `solid-js`, and `@jsxImportSource solid-js` pragmas → the renderer package (`@solidjs/web`); `tsconfig.json`'s `jsxImportSource` is outside the scanned surface and is called out in the guidance.
- **Remaining Solid import subpaths** — `solid-js/store`, `/h`, `/html`, `/universal`, `/jsx-runtime`, `/jsx-dev-runtime` → new package locations.

### JSX
- **JSX component migrations** — binding-resolved JSX uses of `Suspense`, `ErrorBoundary`, `SuspenseList`, `Index` imports from `solid-js`.
- **JSX `classList` migration** — `classList` attributes on intrinsic JSX elements → `class` object/array forms.
- **DOM attribute namespaces** — `attr:` and `bool:` prefixed JSX attributes → standard HTML attributes.
- **DOM event namespaces** — `on:` and `oncapture:` prefixed JSX attributes → camelCase event handlers or ref callbacks.
- **Lowercase DOM event handlers** — `onclick`-style attributes on intrinsic elements, which Solid 2 treats as plain attributes → camelCase handlers.
- **`use:` directives** — Solid 1.x directive syntax → `ref` directive factories.
- **`Context.Provider` JSX sites** — `<Context.Provider value={...}>` → `<Context value={...}>`; an identifier the file declares as something other than a `createContext` call (an object literal or function with its own `Provider` member) is not reported.
- **`<Dynamic>` elements** — kept but deprecated in Solid 2 → `dynamic(source)` factory.

### Reactivity
- **`createComputed`** — removed; choose `createMemo`, `createEffect`, or derived `createSignal`.
- **`createEffect` compute/apply split** — one-argument calls must split into compute and apply callbacks.
- **`createMemo` initial-value migration** — second argument treated as initial value in 1.x, as options in 2.0.
- **`batch`** — removed; default microtask batching, use `flush()` sparingly.
- **`createResource`** — removed; replace with async computations and `Loading` boundaries. Tuple members (`.loading`, `.error`, `.refetch()`, `.mutate()`, including destructured `refetch`/`mutate`) are reported only through bindings resolved from the `createResource` call, in any file the semantic provider can see; a resource forwarded through props or another module's export is not followed.
- **`on` helper** — removed; explicit dependency tracking unnecessary with split effects.
- **`onError` / `catchError` / `resetErrorBoundaries`** — removed; use `Errored` boundaries.
- **`startTransition` / `useTransition`** — removed; use built-in transitions + `isPending`.
- **`createDeferred`** — same name, new meaning (a lag-tolerant async memo); the 1.x idle-time deferral and `timeoutMs` are gone.
- **`createSelector` / `indexArray`** — replaced by `createProjection` / `mapArray keyed: false`.
- **`createDynamic` / `from` / `observable`** — `createDynamic` is replaced by the `dynamic(source)` factory (the `<Dynamic>` wrapper is kept but deprecated); `from` now returns an async iterable for a memo to consume; `observable` is replaced by an effect that pushes to the subscriber.
- **`equalFn` / `getListener` / `writeSignal` / `enableScheduling`** — renamed (`isEqual`, `getObserver`) or removed.

### Lifecycle & props
- **`onMount`** — removed; closest replacement is `onSettled`.
- **`onCleanup`** — still exported for owned scopes; reviewed because split effects, `onSettled`, and now-unowned ref callbacks change where cleanup belongs.
- **Ref callbacks** — inline `ref={el => …}` callbacks on intrinsic elements that call `onCleanup`, effects, primitives, or `getOwner`, which run unowned in Solid 2.
- **Nested `createRoot`** — calls inside a function body, whose root is now disposed with the parent owner.
- **`mergeProps`** — replaced by `merge` with reviewed undefined-value semantics.
- **`splitProps`** — replaced by `omit` with reviewed key-group restructuring.

### Store
- **Store setter calls** — path-style `setStore("a", "b", v)`, object-merge `setStore({ … })`, callbacks that return a value (merged in 1.x, adopted as the whole state in 2.0), and setters passed as values → draft callbacks.
- **`unwrap(store)`** → `snapshot(store)` for point-in-time non-reactive capture.
- **`produce`** — removed; draft-first setters are now the default.
- **`createMutable` / `modifyMutable`** — removed; use `createStore` with draft setters.

Findings for APIs that `eslint-plugin-solid`'s `v2` config keeps reporting after the migration (`solid/removed-api`, `solid/no-single-arg-create-effect`, `solid/prefer-structured-class`, `solid/event-handlers`) say so, so the one-shot guidance and the continuous lint read as one pipeline; the assistant deliberately does not automate four renames that lint rule auto-fixes (`batch`, `mergeProps`, `unwrap`, `onMount`) or the `solid-js/store` move, because the rc.21 sources show each changes behavior. Every finding links the immutable pinned [RC migration guide](https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md). Coverage follows the guide's complete quick rename / removal map.

## Transform

The opt-in `transform` workflow applies seven deterministic rewrites and changes nothing else. Each rule is a separate JSSG entrypoint and sequential workflow step, so later rules see earlier output. The rules operate on disjoint syntax: two rewrite module source strings for disjoint specifier sets; the `classList` and event-handler rules rewrite JSX attribute name nodes; the `Context.Provider` rule rewrites JSX element name nodes; and the `Index` rule rewrites JSX element name nodes plus one `solid-js` import specifier. Each edit is reported on its own line (`file:line:column`, what changed, plus the migration-guide link). Exact combined-output and second-run tests cover ordering, idempotency, and a fixture in which all six rules edit one file in a single pass. The workflow writes no report files or other artifacts in the target.

### JSX type imports and pragmas

Solid 1.9.13 exported the `JSX` namespace from `solid-js`; at rc.21 `solid-js` exports no `JSX` and `@solidjs/web` declares `export type { JSX }`. The rule rewrites the module source of an import statement whose **only** specifier is the type `JSX` (`import type { JSX } from "solid-js"` or `import { type JSX } from "solid-js"`, aliases allowed) to `@solidjs/web`, and rewrites the token `solid-js` in a `@jsxImportSource solid-js` comment pragma to `@solidjs/web`. A statement that also names other `solid-js` bindings would have to be split, so it is left to the analyzer, as are value imports, `JSXElement` (gone in 2.0), namespace imports, import attributes, and `tsconfig.json`.

### Pure subpath relocations

Five subpaths move wholesale:

- `solid-js/h` → `@solidjs/h`
- `solid-js/html` → `@solidjs/html`
- `solid-js/universal` → `@solidjs/universal`
- `solid-js/jsx-runtime` → `@solidjs/web/jsx-runtime`
- `solid-js/jsx-dev-runtime` → `@solidjs/web/jsx-dev-runtime`

This rule covers static imports, re-exports, dynamic `import()`, and `require()` calls, and preserves each reference's import form and quote style. Every one of these moves is a pure package relocation with no removed, renamed, or behaviorally changed export, so the rewrite is safe without binding-level review.

### Binding-gated `solid-js/web` → `@solidjs/web`

`solid-js/web` is **not** a pure relocation. Comparing the published client builds of `solid-js@1.9.13` and `@solidjs/web@2.0.0-rc.21`, these 1.9 exports are gone: `createDynamic`, `Index`, `Hydration`, `NoHydration`, `renderToStringAsync`, `ssrClassList`, `ssrSpread`, `classList`, `addEventListener`, `clearDelegatedEvents`, `setBoolAttribute`, `innerHTML`, `use`, `Aliases`, `Properties`, `SVGNamespace`, `getPropAlias`, `Assets`, `getAssets`, and `useAssets` (plus `pipeToNodeWritable` and `pipeToWritable` on the server build); `Suspense`, `ErrorBoundary`, `SuspenseList`, and `mergeProps` are no longer re-exported for application code (`Loading`, `Errored`, `Reveal`, and `merge` replace them, and the `mergeProps` that rc.21 still exports is a compiler helper marked `@internal`); `Portal` lost `useShadow`, `isSVG`, and `ref` and renders nothing on the server; and `isDev` is no longer pinned to `false` on the server entry. A separate default-deny rule therefore relocates a `solid-js/web` statement only when it is a named static import or a named re-export **and** every name it takes from the module is on this allowlist of bindings proven compatible across the move:

`Dynamic`, `hydrate`, `isServer`, `render`

`Dynamic` joined the list with rc.21. Earlier RCs described `<Dynamic>` in prose and compiler defaults but exported no such binding, so the rule refused it; at `2105ffb8`, `packages/web/src/index.ts` exports `function Dynamic(props)` (implemented over the `dynamic()` factory) and both published rc.21 builds carry the name, with the 1.9 user-facing contract and the migration guide's statement that existing `<Dynamic>` code keeps working. The same guide marks `<Dynamic>` **deprecated** (no runtime warning) in favor of `dynamic(source)`, so every report line that relocates it says so.

Every other name is vetoed, including `Portal`, `isDev`, `For`, `Show`, `Switch`, `Match`, `renderToString`, `renderToStream`, `getRequestEvent`, the compiler helpers, and the `DynamicProps` type (whose `component` shape widened). A statement that mixes an allowed name with a vetoed one is left entirely unchanged. Namespace imports, default imports, side-effect imports, empty name lists, `export *`, `export * as`, `export { default as … }`, dynamic `import()`, `require()`, `import("solid-js/web").X` type queries, string-literal specifier names, and import attributes are all rejected outright. Aliases, inline `type` modifiers, and quote style survive untouched, and an escaped specifier such as `"solid-js\x2fweb"` is the same module, so it is eligible once its bindings pass.

Because this rule owns `solid-js/web` exclusively, the pure-relocation map above never contains it, and no `solid-js/web` statement is ever rewritten on the strength of its module string alone. The read-only web-import analyzer still reports every statement this rule refuses.

### Intrinsic JSX `classList` → `class`

Solid 2 removes the `classList` attribute and folds its behavior into `class`, which accepts a string, an object whose truthy keys are applied as class names, or an array of those. The runtime applies an object-valued `class` with the same per-key toggling, whitespace-key splitting, and falsy-key skipping that Solid 1.x applied for `classList`, and the compiler decomposes an inline `class={{ … }}` literal per property exactly as it decomposed `classList`. On an element whose only class source is one `classList` expression, renaming the attribute key is therefore an equivalence, so the transform rewrites:

```jsx
<div id="first" classList={flags} />   →   <div id="first" class={flags} />
```

Only the attribute name changes; the value expression, its comments, its whitespace, and every other attribute stay byte-identical. An element is rewritten only when it is intrinsic (a plain lowercase-initial element name), carries exactly one plainly named `classList` attribute, and gives that attribute an expression container holding exactly one expression.

A second case merges a literal `class` string with an object-literal `classList` into the array form the guide shows: `<div class="card" classList={{ active: isActive() }} />` becomes `<div class={["card", { active: isActive() }]} />`, keeping the string and the object literal byte-identical and dropping the `classList` attribute. Measured against the pinned builds (`solid-js@1.9.13` with `babel-plugin-jsx-dom-expressions@0.40.7`, and `@solidjs/web@2.0.0-rc.21` with `@solidjs/babel-plugin@2.0.0-rc.21`), the two forms emit the same class tokens on the DOM and in SSR output only while no object key names a token of the static string: 1.x's DOM runtime removes a static token when its key turns falsy, 2.0's array form never does. So the merge applies only when the string is a plain double-quoted literal (no backslash, ampersand, quote, or line break), every object property is a plain pair or shorthand with an identifier or string key (no computed key, spread, method, or getter), and no whitespace-separated key token equals a static token.

Everything else is left to the analyzer's manual-review guidance, by design:

- components, member components (`Components.Widget`), and namespaced element names (`svg:circle`), which never reach the DOM class path;
- elements with any other class source — an expression `class`, `className`, the same names under a namespace (`attr:class`, `prop:className`, `bool:class`), or a `class:` toggle — and a literal `class` beside a `classList` that is not an object literal with disjoint literal keys;
- elements with a spread attribute anywhere, since a spread can supply or override `class` and its position decides precedence;
- duplicate `classList` attributes on one element;
- shorthand (`classList`), string (`classList="active"`), empty (`classList={}`), and comment-only values;
- near-miss and dynamic attribute names such as `ns:classList`, `class-list`, `classlist`, and `data-classList`; and
- any element whose attribute list does not parse cleanly.

The rewrite assumes Solid semantics for the scanned project, which is what the workflow is scoped to; it does not verify that a file imports Solid, because Solid JSX files frequently import nothing from `solid-js` directly.

### Same-file `Context.Provider` → `Context`

Solid 1.x `createContext()` returned `{ id, Provider, defaultValue }`; at rc.21 it returns the provider component itself, `Context.Provider` is `undefined`, and the migration guide prescribes `<Theme.Provider value="dark">…</Theme.Provider>` → `<Theme value="dark">…</Theme>`. The rule applies exactly that rename to both tags of an element (or to a self-closing one) when the context is proven in the same file:

- the file has exactly one named `createContext` import from `solid-js` (aliases are fine; `import type`, namespace imports, and other modules are not), bound nowhere else in the file;
- the context is declared exactly once, as a `const` initialized by a direct call of that import, and no parameter, destructuring, or nested declaration binds the same name anywhere in the file; and
- the element carries exactly one attribute, a plainly named `value` with a string or single-expression value, and no spread.

Contexts imported from other modules, created through wrappers or namespace imports, declared with `let`/`var`, or shadowed anywhere are left to the analyzer, as are elements with any other attribute shape. A non-JSX `Context.Provider` member access is neither rewritten nor a reason to refuse the JSX sites. Solid 2 treats `value={undefined}` as "no provider" (a default-less context then throws), where 1.x fell through to the default; the analyzer's guidance records that runtime change.

### `Index` → `For keyed={false}`

Solid 2 removes `Index`; `For` with `keyed={false}` takes the same `each`, the same optional `fallback`, and the same child callback `(item: Accessor<T>, index: number)`, mapped through `mapArray` with `keyed: false`. The rule renames every `<Index>` tag in a file to `<For keyed={false}>` (closing tags to `</For>`) and renames the `Index` import specifier to `For`, or removes it together with one adjacent comma when the same statement already imports `For`, but only when the whole file is accounted for:

- exactly one named, unaliased, non-type `Index` import from `solid-js`;
- every other `Index` identifier is a JSX element name, and every `For` identifier is that import or a JSX element name (no `Index` or `For` type identifier exists); and
- every `<Index>` element carries only `each` and `fallback` attributes as single-expression containers, with `each` present, no duplicates, no spread, and a matching closing tag.

If any element fails, the whole file stays unchanged, because renaming the import while an element still reads `Index` would break it. `Index` from `solid-js/web` or another module, aliased or type-only imports, a sole `Index` specifier whose `For` lives in a separate statement, and elements with `ref`, `keyed`, or `children` attributes are left to the analyzer.

### Lowercase `on*` handlers → camelCase

Solid 1.x derived every event name on a native element as `prop.slice(2).toLowerCase()` (`dom-expressions@0.40.8` and `babel-plugin-jsx-dom-expressions@0.40.7`, pinned by `solid-js@1.9.13`), so `onclick` and `onClick` compiled, bound, delegated, and server-rendered identically. Solid 2 binds an event only for `on` followed by an uppercase letter; a lowercase `on*` name is a plain attribute in the browser, in SSR output, and through spreads (in development it warns with `LOWERCASE_EVENT_ATTRIBUTE`). The rule renames `<button onclick={fn}>` to `<button onClick={fn}>` when:

- the element is intrinsic (including custom elements), never a component;
- the camelCase spelling is one of the 143 event handler names declared by the rc.21 web JSX types (`packages/web/jsx/jsx.d.ts`);
- the value is a single-expression container (a string value is the HTML inline-handler attribute in 2.0);
- no other attribute on the element targets the same event (`onClick` beside `onclick`, a duplicate, or an `on:`/`oncapture:` form); and
- the element carries no spread attribute, since a spread can supply the camelCase handler and merge order decides which wins.

Custom event names, string values, components, spreads, conflicts, and the removed `on:`/`oncapture:` namespaces are left to the analyzers.

### Shared limits

All seven rules deliberately leave `solid-js/store`, already-migrated paths, and near-miss subpaths such as `solid-js/h-extra`, `vendor/solid-js/h`, and `solid-js/web/storage` untouched. `solid-js/store` is not relocated even though the guide maps it to `solid-js`: `createStore` setters are draft-first in 2.0, `reconcile` changed its signature, and `unwrap`, `produce`, `createMutable`, and `modifyMutable` are renamed or removed, so no store binding meets the proof bar this workflow holds to.

Run the transform through the launcher's `transform` subcommand:

```sh
npx --yes solid-migration-assistant@latest transform --target /path/to/a/solid-project
```

Because this workflow rewrites files in place, the launcher first runs `git status` in the target and refuses when the tree has uncommitted changes or is not inside a git repository, so every rewrite lands on a clean checkout that `git diff` can review and `git checkout` can revert; pass `--allow-dirty` to skip that check. In this repository, `pnpm transform` runs the same subcommand with `--allow-dirty` against the package directory; the raw Codemod invocation still works and performs no git check of its own:

```sh
node ./node_modules/codemod/codemod --disable-analytics workflow run -w transform.yaml -t /path/to/a/solid-project --allow-dirty --no-interactive
```

After publication, select the `transform` workflow from the Codemod platform (it is registered with `default: false`).

## Deliberate limits

Current coverage is deliberately limited: the analyzer does not cover indirect calls, shadowed bindings, unsupported argument counts, re-exports, dynamic imports, `require`, TypeScript `import()` type expressions, configuration, dependencies, SSR, libraries, monorepos, or cross-file intent. Binding-sensitive call and JSX rules also exclude aliased and namespace bindings. No guidance—or a clean run—is not a readiness result and does not imply complete Solid 2 migration coverage.

The read-only `analyze` workflow remains detection-only, including for every `solid-js/web` statement, `classList` attribute, `Context.Provider` element, `Index` element, and lowercase handler the transform refuses. Broader automated transforms remain roadmap items beyond the seven rules implemented by the `transform` workflow; `Suspense`/`ErrorBoundary`/`SuspenseList` renames, `onMount`, `mergeProps`/`splitProps`, `unwrap`, the `attr:`/`bool:` namespaces, and `solid-js/store` relocation were each audited against rc.21 and left to guidance because their 2.0 forms are not provably equivalent at the syntax level. Growing the `solid-js/web` allowlist requires fresh upstream evidence per name, not a blanket widening.

## Preliminary workspace-pass benchmark

Run `pnpm benchmark:workspace-passes` for the default checked-in fixture, or `pnpm benchmark:workspace-passes -- --target /path/to/project` for another target. The opt-in script times one JSSG workspace-semantic step against that step repeated to match the current analysis-rule step count. Each pass forces reference resolution for one imported binding per source file. It prints raw samples, medians, delta, slowdown ratio, a marginal-pass estimate, and final JSON; relevant source hashes must remain unchanged. The benchmark is directional only. Each sample times a whole Codemod CLI invocation, so process startup dominates small targets and deltas inside run-to-run noise can be negative. The probe does not reproduce the number or shape of semantic queries made by the real analyzers, compare complete old and new analyzer workflows, model full rule traversal cost, control OS caches, or run as part of `verify`.

## Verify

From the workspace root:

```sh
pnpm verify
```

Verification checks the two-workflow architecture, comprehensive analysis and transformation rule boundaries, exact and repeatable terminal output, analyzer fixture immutability, transform idempotency, TypeScript types, and workflow schema validity.

Testing runs in three tiers:

1. **Every change:** `pnpm verify`, described above. It needs no network.
2. **Before a release, and whenever a rule changes:** `pnpm test:release`, which runs the two opt-in suites below. Both need network access, and the RC check needs Node 22.12 or newer. It also fails when npm's `solid-js@next` has moved past the pinned RC, or when the pinned version was published from a different commit than the one every guidance link cites; the fix is `node tools/bump-target.mjs <version> <commit>` plus a re-audit of the guidance against the new migration guide.
3. **When a transform rule is added or widened:** a one-time manual review, recorded in the pull request, of every hunk the rule produces on the corpus; a case for the rule in `tests/rc-compat/project`; and the reviewed corpus baseline diff. See `CONTRIBUTING.md`.

`pnpm test:rc-compat` is an opt-in addition that needs network access and Node 22.12 or newer: it transforms `tests/rc-compat/project`, compares the result with the checked-in expected tree, installs the exact pinned RC packages (`solid-js`, `@solidjs/web`, `@solidjs/h`, and `@solidjs/babel-plugin` at `2.0.0-rc.21` with their tooling), typechecks the transformed source against the RC types, compiles it with the RC Babel plugin in DOM and SSR mode, server-renders it and compares the markup, and proves that the untransformed 1.9 input is rejected by the RC compiler at its `classList` attribute and has no `Context.Provider` at runtime.

`pnpm test:corpus` is a second opt-in check that needs network access and is not part of `verify`. It clones the open-source Solid 1.x projects listed in `tests/corpus/corpus.json` (each pinned to a commit, with the license found in the repository recorded in the manifest) into a temporary directory and proves, for each one, that the analyzer exits successfully, leaves the target byte-identical, and logs no crash; that the transform changes exactly the files it reports and adds or deletes nothing; that every rewritten file still parses; and that a second transform run is a no-op. It prints one JSON summary line per project with finding and rewrite counts and per-phase timings, and compares those counts with the reviewed `tests/corpus/baseline.json`: any new, removed, or changed headline fails the run with a per-headline delta until `pnpm corpus:update-baseline` is run and the diff is committed together with the change that caused it.

## Fixture provenance

Most fixtures are synthetic. The following are reduced, attributed snippets of public MIT-licensed Solid ecosystem code, kept to a few lines each with their origin, commit, and license recorded in the file header:

- `solidjs/solid` `packages/solid/web/test/context.spec.tsx` and `packages/solid/web/test/index.spec.tsx` at `v1.9.13` (commit `3be495ce`), MIT.
- `solidjs-community/solid-primitives` `packages/active-element/dev/index.tsx` and `packages/memo/dev/lazy.tsx` at commit `9c81cd0d`, MIT.
