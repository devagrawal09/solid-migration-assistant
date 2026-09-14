# Solid Migration Assistant

This package implements Solid Migration Assistant as two TypeScript workflows on the `@codemod.com/orchestration` prototype for a narrow Solid 1.9 client-application profile. The read-only `analyze` workflow defines each of 37 named analyzers as its own inline JSSG transform and declares all 37 workspace-semantic commands as one parallel group; it prints one detailed, location-bearing guidance string per supported migration site, returns no edits, and writes no files. The `transform` workflow defines each of three deterministic rules as its own inline transform and awaits them as three sequential commands: relocating a small, pure subset of legacy import subpaths, relocating `solid-js/web` statements whose complete named binding set is proven compatible, and rewriting the narrow, provably equivalent subset of intrinsic JSX `classList` attributes to `class`. The workflow modules under `workflows/` are the only production composition layer.

The migration target is pinned to Solid `2.0.0-rc.0` at upstream commit [`ff4d3c44`](https://github.com/solidjs/solid/tree/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5).

## Run from this checkout

> **RC scope:** version `0.3.0` targets Solid `2.0.0-rc.0` and implements only the detections and relocations documented below. A clean run is not proof that a project is ready for Solid 2.

The workflows run on `@codemod.com/orchestration`, the TypeScript orchestration prototype in the Codemod monorepo. That package is private and unpublished, and its Rust execution bridge (`butterflow-execution-bridge`) is not distributed, so this package cannot be installed from a registry. It links the prototype from a sibling checkout of the monorepo (`"@codemod.com/orchestration": "link:../../../codemod/packages/orchestration"`, that is `../codemod` beside this repository on its `prototype/typescript-orchestration` branch) and resolves the bridge at that checkout's `target/debug/butterflow-execution-bridge`. Node 24 or newer is required: the launcher runs the workflow process with `--experimental-transform-types` because the prototype and this package are TypeScript source.

```sh
# beside this repository
git clone https://github.com/codemod/codemod ../codemod
git -C ../codemod switch prototype/typescript-orchestration
(cd ../codemod && pnpm install && cargo build -p butterflow-execution-bridge)

# in this repository
pnpm install
pnpm analyze -- --target /path/to/a/solid-project
```

The current directory is the default target, so `node ./bin/solid-migration-assistant.mjs` from a project root analyzes that project. An explicit target may be absolute or relative to the current directory. Set `CODEMOD_BRIDGE_BIN` to run another bridge build; the launcher fails before starting anything when no bridge exists.

A run with detections exits successfully. Complete opaque guidance strings are exact-deduplicated, sorted lexically as whole strings, and printed once to standard output as a terminal aggregate. Standard error carries only the final disclosure. A usage or target error exits with status 2 and a failed or cancelled command with status 1; both end with the disclosure. To capture the findings in a file, redirect standard output: `pnpm analyze -- --target . > report.txt`; to also capture the disclosure, redirect both streams. The analyzer does not edit the target or create persistent output there: every analyzer transform returns guidance and no edit, the launcher keeps workflow history in memory, and the bridge exchanges each command through a private temporary directory that is removed after the command. No telemetry exists in this runtime. Interrupting a run with `SIGINT` or `SIGTERM` cancels the commands in flight, kills their bridge processes, refuses the ones still queued for capacity without starting them, writes nothing, and reports the cancellation. Because the analyzers overlap, the command named by a failure or cancellation is whichever one reported first, not a fixed one; the guidance a successful run prints does not depend on the order in which commands finish.

**Publication blocker:** this version is not publishable. `npx solid-migration-assistant` cannot work until `@codemod.com/orchestration` is published (it is `private` today) and the bridge binary ships with it or as a `codemod` subcommand. A registry install cannot resolve the `link:` dependency, so `npm install` of the packed tarball fails; the packaging test therefore extracts the tarball by hand and links the prototype in, which proves the packed file list is complete but not that the package installs.

## How the workflows run

Every rule keeps its own definition, exactly one per named rule:

```ts
const batch = jssg({
  name: "analyzeBatch",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeBatch, root),
});
```

A transform may use only its parameters and imported bindings, so each delegates to the per-file adapter in `shared/entrypoint.ts` with the rule it imports from `rules/`. When the launcher loads a workflow, the orchestration build step bundles that adapter, the rule, and the shared scanners it imports into one self-contained artifact identified by its content hash; the rule modules are never duplicated into the workflow files. Each command selects the target's project-owned `.js`, `.jsx`, `.ts`, and `.tsx` files (excluding `node_modules`, `dist`, `build`, `coverage`, and `.d.ts`), sends the whole set to one bridge process, and in workspace mode indexes that whole set before any file runs, so a rule's `references()` lookups resolve call sites in other project files. No static selector is declared: every selected file runs every rule, exactly as the former YAML steps did. The analyzers stay 37 separate commands, one per rule, as the YAML workflow ran them; consolidating them into fewer commands was deliberately not done, and the opt-in benchmark below measures what a command costs.

The analyzers read the target and share nothing, so the `analyze` body declares all 37 of them as one `parallel()` group rather than awaiting them one at a time:

```ts
export default workflow(async () => {
  const commands: string[][][] = await parallel(analyzers);
  return { guidance: aggregateReport(commands) };
});
```

The group states only that those commands are eligible to overlap. How many actually run at once is the engine's decision: every executed operation takes a permit from one weighted admission scheduler per run, where a workspace-semantic JSSG batch is the heaviest kind because it holds a bridge process, the whole selected file set, and one workspace index. This package declares no chunking, no concurrency level, and no scheduler of its own, and it exposes no concurrency option; capacity is host configuration in the engine (`CODEMOD_ORCHESTRATION_CAPACITY`). Commands are still issued in declaration order, and `parallel()` returns one output per member in that same order however the commands interleave, so the printed aggregate is byte-identical to a one-at-a-time run. The three `transform` rewrites stay sequential on purpose: they mutate the target, and each one must read what the previous one committed.

An analyzer transform returns each file's guidance as structured output and never content; a rewrite transform returns the committed edits as the file's new content and the per-edit report lines as output. The runtime aggregates outputs in deterministic file order and commits a command's edits only after every file succeeded, so a later command reads what the earlier one committed. The final workflow stage flattens every analyzer command's per-file strings, exact-deduplicates them, sorts them as whole strings, and returns the guidance list directly; the transform workflow returns `{ report }`. The launcher prints the resulting list and nothing else.

## Supported detections

### Imports
- **Solid web package imports** — static ES imports from `solid-js/web` → `@solidjs/web`.
- **Remaining Solid import subpaths** — `solid-js/store`, `/h`, `/html`, `/universal`, `/jsx-runtime`, `/jsx-dev-runtime` → new package locations.

### JSX
- **JSX component migrations** — binding-resolved JSX uses of `Suspense`, `ErrorBoundary`, `SuspenseList`, `Index` imports from `solid-js`.
- **JSX `classList` migration** — `classList` attributes on intrinsic JSX elements → `class` object/array forms.
- **DOM attribute namespaces** — `attr:` and `bool:` prefixed JSX attributes → standard HTML attributes.
- **DOM event namespaces** — `on:` and `oncapture:` prefixed JSX attributes → camelCase event handlers or ref callbacks.
- **`use:` directives** — Solid 1.x directive syntax → `ref` directive factories.
- **`Context.Provider` JSX sites** — `<Context.Provider value={...}>` → `<Context value={...}>`.

### Reactivity
- **`createComputed`** — removed; choose `createMemo`, `createEffect`, or derived `createSignal`.
- **`createEffect` compute/apply split** — one-argument calls must split into compute and apply callbacks.
- **`createMemo` initial-value migration** — second argument treated as initial value in 1.x, as options in 2.0.
- **`batch`** — removed; default microtask batching, use `flush()` sparingly.
- **`createResource`** — removed; replace with async computations and `Loading` boundaries.
- **`on` helper** — removed; explicit dependency tracking unnecessary with split effects.
- **`onError` / `catchError` / `resetErrorBoundaries`** — removed; use `Errored` boundaries.
- **`startTransition` / `useTransition` / `createDeferred`** — removed; use built-in transitions + `isPending`.
- **`createSelector` / `indexArray`** — replaced by `createProjection` / `mapArray keyed: false`.
- **`createDynamic` / `from` / `observable`** — replaced by `dynamic(source)` factory / async iterators.
- **`equalFn` / `getListener` / `writeSignal` / `enableScheduling`** — renamed (`isEqual`, `getObserver`) or removed.

### Lifecycle & props
- **`onMount`** — removed; closest replacement is `onSettled`.
- **`mergeProps`** — replaced by `merge` with reviewed undefined-value semantics.
- **`splitProps`** — replaced by `omit` with reviewed key-group restructuring.

### Store
- **`unwrap(store)`** → `snapshot(store)` for point-in-time non-reactive capture.
- **`produce`** — removed; draft-first setters are now the default.
- **`createMutable` / `modifyMutable`** — removed; use `createStore` with draft setters.

Every finding links the immutable pinned [RC migration guide](https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md). Coverage follows the guide's complete quick rename / removal map.

## Transform

The opt-in `transform` workflow applies three deterministic rewrites and changes nothing else. Each rule is a separate inline definition and a separate awaited command, so later rules see earlier output. The current rules operate on disjoint syntax: two rewrite module source strings for disjoint specifier sets, and the third rewrites JSX attribute name nodes. Each edit is reported on its own line (`file:line:column`, what changed, plus the migration-guide link). Exact combined-output and second-run tests cover ordering and idempotency. The workflow writes no report files or other artifacts in the target.

### Pure subpath relocations

Five subpaths move wholesale:

- `solid-js/h` → `@solidjs/h`
- `solid-js/html` → `@solidjs/html`
- `solid-js/universal` → `@solidjs/universal`
- `solid-js/jsx-runtime` → `@solidjs/web/jsx-runtime`
- `solid-js/jsx-dev-runtime` → `@solidjs/web/jsx-dev-runtime`

This rule covers static imports, re-exports, dynamic `import()`, and `require()` calls, and preserves each reference's import form and quote style. Every one of these moves is a pure package relocation with no removed, renamed, or behaviorally changed export, so the rewrite is safe without binding-level review.

### Binding-gated `solid-js/web` → `@solidjs/web`

`solid-js/web` is **not** a pure relocation. Its export surface changed between Solid 1.9.13 and 2.0.0-rc.7: `createDynamic`, `Index`, `SuspenseList`, `renderToStringAsync`, `ssrClassList`, and `pipeToNodeWritable` are gone; `Suspense`, `ErrorBoundary`, and `mergeProps` were renamed to `Loading`, `Errored`, and `merge`; `Portal` lost `useShadow`, `isSVG`, and `ref`; and `isDev` is no longer pinned to `false` on the server entry. A separate default-deny rule therefore relocates a `solid-js/web` statement only when it is a named static import or a named re-export **and** every name it takes from the module is on this allowlist of bindings proven identical across the move:

`hydrate`, `isServer`, `render`

Every other name is vetoed, **including `Dynamic`**. Upstream prose and compiler configuration both point at `Dynamic`: the migration guide says `<Dynamic component={...}>` is user-facing unchanged and shows `import { Dynamic } from "@solidjs/web"` as the 2.0 form, and the Babel plugin auto-imports `Dynamic` from that same default module. But no `Dynamic` export exists in the rc.7 runtime source — the identifier does not appear anywhere under `packages/`. A guide describes intent and a compiler config describes an expectation; neither is a binding that can be proven compatible, which is what this list promises, and rewriting an import to a name the target package does not export would break the build it claims to migrate. `Dynamic` therefore stays vetoed until an actual exported implementation lands. The read-only analyzer still reports every such site for manual review.

A statement that mixes an allowed name with a vetoed one is left entirely unchanged. Namespace imports, default imports, side-effect imports, empty name lists, `export *`, `export * as`, `export { default as … }`, dynamic `import()`, `require()`, `import("solid-js/web").X` type queries, string-literal specifier names, and import attributes are all rejected outright. Aliases, inline `type` modifiers, and quote style survive untouched, and an escaped specifier such as `"solid-js\x2fweb"` is the same module, so it is eligible once its bindings pass.

Because this rule owns `solid-js/web` exclusively, the pure-relocation map above never contains it, and no `solid-js/web` statement is ever rewritten on the strength of its module string alone.

This allowlist is the one place the project reads a later upstream commit than the pinned `ff4d3c44` guidance target: the names were compared against [`7f416cf7`](https://github.com/solidjs/solid/tree/7f416cf75dde3b89739d53b15305ac6c3c41355c) (where `packages/web` is `@solidjs/web` `2.0.0-rc.7`) on one side and the `v1.9.13` tag on the other, because the web entry's export surface is what has to be proven. Its report lines link that commit accordingly, so a `solid-js/web` line and a subpath line in the same run cite different commits by design. Reading that commit is also what showed `Dynamic` to be unexported there, which is why it is vetoed rather than allowlisted.

### Intrinsic JSX `classList` → `class`

Solid 2 removes the `classList` attribute and folds its behavior into `class`, which accepts a string, an object whose truthy keys are applied as class names, or an array of those. The runtime applies an object-valued `class` with the same per-key toggling, whitespace-key splitting, and falsy-key skipping that Solid 1.x applied for `classList`, and the compiler decomposes an inline `class={{ … }}` literal per property exactly as it decomposed `classList`. On an element whose only class source is one `classList` expression, renaming the attribute key is therefore an equivalence, so the transform rewrites:

```jsx
<div id="first" classList={flags} />   →   <div id="first" class={flags} />
```

Only the attribute name changes; the value expression, its comments, its whitespace, and every other attribute stay byte-identical. An element is rewritten only when it is intrinsic (a plain lowercase-initial element name), carries exactly one plainly named `classList` attribute, and gives that attribute an expression container holding exactly one expression.

Everything else is left to the analyzer's manual-review guidance, by design:

- components, member components (`Components.Widget`), and namespaced element names (`svg:circle`), which never reach the DOM class path;
- elements with any other class source — `class`, `className`, the same names under a namespace (`attr:class`, `prop:className`, `bool:class`), or a `class:` toggle — including the `class="card"` plus `classList={…}` merge into the array form, whose precedence between the static class and the object's keys is not settled by an upstream test;
- elements with a spread attribute anywhere, since a spread can supply or override `class` and its position decides precedence;
- duplicate `classList` attributes on one element;
- shorthand (`classList`), string (`classList="active"`), empty (`classList={}`), and comment-only values;
- near-miss and dynamic attribute names such as `ns:classList`, `class-list`, `classlist`, and `data-classList`; and
- any element whose attribute list does not parse cleanly.

The rewrite assumes Solid semantics for the scanned project, which is what the workflow is scoped to; it does not verify that a file imports Solid, because Solid JSX files frequently import nothing from `solid-js` directly.

### Shared limits

All three rules deliberately leave `solid-js/store`, already-migrated paths, and near-miss subpaths such as `solid-js/h-extra`, `vendor/solid-js/h`, and `solid-js/web/storage` untouched.

In this repository, run `pnpm transform` against the current directory, or pass a target:

```sh
pnpm transform -- --target /path/to/a/solid-project
```

The report lines are printed to standard output in deterministic whole-string order; the transform prints no disclosure and, on a second run over the same tree, nothing at all.

## Deliberate limits

Current coverage is deliberately limited: the analyzer does not cover indirect calls, shadowed bindings, unsupported argument counts, re-exports, dynamic imports, `require`, TypeScript `import()` type expressions, configuration, dependencies, SSR, libraries, monorepos, or cross-file intent. Binding-sensitive call and JSX rules also exclude aliased and namespace bindings. No guidance—or a clean run—is not a readiness result and does not imply complete Solid 2 migration coverage.

The read-only `analyze` workflow remains detection-only, including for every `solid-js/web` statement and every `classList` attribute the transform refuses. Broader automated transforms remain roadmap items beyond the five pure import-path relocations, the binding-gated `solid-js/web` relocation, and the intrinsic `classList` rename implemented by the `transform` workflow. Growing the `solid-js/web` allowlist requires fresh upstream evidence per name, not a blanket widening.

## Preliminary workspace-pass benchmark

Run `pnpm benchmark:workspace-passes` for the default checked-in fixture, or `pnpm benchmark:workspace-passes -- --target /path/to/project` for another target. The opt-in script generates temporary workflow modules whose inline definitions mirror the production analyzers (same applicability, `semanticAnalysis: "workspace"`, declared as one parallel group) and times one workspace-semantic command against that command repeated to match the current analyzer count. Each command forces reference resolution for one imported binding per source file. It prints raw samples, medians, delta, slowdown ratio, a marginal-command estimate, the host's admission capacity and how many workspace-semantic commands that admits at once, and final JSON; relevant source hashes must remain unchanged. The benchmark is directional only. Each sample times one in-process workflow run, so Node startup is excluded while each command's bridge process startup, workspace indexing, and per-file sandbox runtime are included, and deltas inside run-to-run noise can be negative. Because both modes are scheduled groups, the added cost and marginal estimate describe bounded parallel commands on the measuring host rather than a serial sum, and a host with different capacity reports different numbers for the same work. The probe does not reproduce the number or shape of semantic queries made by the real analyzers, compare complete old and new analyzer workflows, model full rule traversal cost, control OS caches, or run as part of `verify`.

## Verify

From the workspace root:

```sh
pnpm verify
```

Verification checks the two-workflow composition (one inline definition per named rule, one parallel analyzer group with no chunking or concurrency knob, sequential rewrites, no shared workflow state), comprehensive analysis and transformation rule boundaries, exact and repeatable terminal output, cross-file semantic resolution, out-of-order completion of the analyzer group, the admission bound on real bridge processes, analyzer fixture immutability, launcher failure and cancellation behavior, transform idempotency, the packed file list, and TypeScript types for both the sandbox-side program (`tsconfig.json`, rules and bundled helpers against the sandbox's module shims) and the workflow-side program (`tsconfig.workflows.json`, workflows against Node and the orchestration runtime).
