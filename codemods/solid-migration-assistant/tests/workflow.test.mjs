import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DISCLOSURE, resolveBridgeBinary } from "../shared/run-workflow.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = resolve(packageDirectory, "bin/solid-migration-assistant.mjs");
const analyzeWorkflow = resolve(packageDirectory, "workflows/analyze.ts");
const transformWorkflow = resolve(packageDirectory, "workflows/transform.ts");
const fixtureDirectory = resolve(packageDirectory, "tests/fixture");
const emptyDirectory = resolve(packageDirectory, "tests/empty");
const SOURCE_INCLUDE = ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"];
const SOURCE_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/*.d.ts",
];
/** The 37 analyzers, in the order the workflow declares them in its group. */
const expectedAnalyzers = [
  "analyzeBeta32SubpathImports",
  "analyzeWebImport",
  "analyzeJsxClassListAttributes",
  "analyzeJsxComponentRenames",
  "analyzeContextProvider",
  "analyzeDomAttrNamespaces",
  "analyzeDomEventNamespaces",
  "analyzeDomUseDirective",
  "analyzeOnCleanup",
  "analyzeOnMount",
  "analyzeMergeProps",
  "analyzeSplitProps",
  "analyzeBatch",
  "analyzeCreateComputed",
  "analyzeCreateDynamic",
  "analyzeCreateEffect",
  "analyzeCreateMemo",
  "analyzeCreateResource",
  "analyzeCreateSelector",
  "analyzeOnError",
  "analyzeCatchError",
  "analyzeResetErrorBoundaries",
  "analyzeFrom",
  "analyzeObservable",
  "analyzeIndexArray",
  "analyzeOnHelper",
  "analyzeStartTransition",
  "analyzeUseTransition",
  "analyzeCreateDeferred",
  "analyzeEqualFn",
  "analyzeGetListener",
  "analyzeWriteSignal",
  "analyzeEnableScheduling",
  "analyzeCreateMutable",
  "analyzeModifyMutable",
  "analyzeProduce",
  "analyzeUnwrap",
];
const expectedRewrites = [
  "relocateLegacySubpaths",
  "relocateWebPackage",
  "rewriteClassListToClass",
];
const expectedGuidance = [
  'src/excluded.ts:3:1 Manual review required: choose a Solid 2 replacement for this createComputed call.\nWhy: Solid 2.0.0-rc.0 removes createComputed; the correct replacement depends on whether the callback derives a value, performs an effect, or encodes stateful update logic. This call has 1 semantic argument(s).\nGuidance: Read the complete callback, its consumers, nearby signal/store declarations, and ordering assumptions. Use createMemo only for a readonly derived value that consumers read. Use Solid 2\'s split createEffect when reactive reads can be isolated in the compute callback and imperative work belongs in the untracked effect callback. Use function-form createSignal, or derived createStore for object and array projections, only when writable derived state is intentional. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the callback uses its previous value or an initial/options argument, writes to a dependency or may form a cycle, mixes several operations, relies on immediate or render ordering, registers cleanup, starts async work, contains nested control flow or reactive primitive creation, or has unclear ownership or consumers. Ask for the smallest focused test or runtime observation that exposes the required value, timing, and write behavior. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#createcomputed--creatememo-createeffect-or-derived-createsignal',
  'src/excluded.ts:4:1 Manual review required: migrate this mergeProps call to a reviewed merge.\nWhy: Solid 2.0.0-rc.0 replaces mergeProps with merge, but merge treats a property that exists on a later source with the value undefined as the winner instead of falling through to an earlier source. This call has 2 semantic argument(s).\nGuidance: Read every source in argument order, list all overlapping keys, and trace every consumer of the merged value. Replace mergeProps with merge from solid-js only after proving that every later overlapping value is non-undefined and that zero-argument behavior, one-source result identity, and mutation semantics do not matter. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a replacement when existing TypeScript types or the inferred Merge result type are the only runtime-safety evidence, a source is any/unknown/union-typed at runtime, a props or store proxy, a function, or has getters or dynamic key presence, source or result identity or mutation is observed, or a consumer depends on fallback-through-undefined behavior. If old undefined-fallback behavior is required, preserve live reactive reads with a targeted manual guard at the disputed property boundary rather than object spread or Object.assign. Ask for the smallest focused test or runtime observation that exposes the disputed property\'s value, precedence, identity, and mutation boundary. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#mergeprops--splitprops--merge--omit',
  'src/excluded.ts:5:1 Manual review required: migrate this createMemo initial value.\nWhy: Solid 1.x treats this call\'s second argument as its initial value, while Solid 2.0.0-rc.0 treats the second argument as options and has no initial-value argument.\nGuidance: Read the complete callback, the initial-value expression, its consumers, and nearby reactive state. Establish what the callback must receive on its first run and how later updates use the previous value. Preserve that behavior explicitly in surrounding state or callback logic before removing the legacy initial-value argument. For a three-argument call, review the legacy options separately and move only options supported by Solid 2.0.0-rc.0 into the second-argument position; for a two-argument call, do not reinterpret an option-shaped initial value as options. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when first-run or previous-value behavior is unclear, the initial-value expression has meaningful evaluation timing or side effects, options are dynamic or their compatibility is unknown, the callback writes to its inputs or may form a cycle, or ownership and consumers are unclear. Ask for the smallest focused test or runtime observation that exposes the first computed value and subsequent updates. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup',
  'src/language.js:1:24 Move this Solid web renderer static import.\nWhy: Solid 2 publishes the web renderer from @solidjs/web instead of the solid-js/web subpath.\nGuidance: Change only this static import\'s module source to @solidjs/web and preserve its import form and quote style. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now',
  'src/language.jsx:1:39 Manual review required: migrate this intrinsic JSX classList attribute to class.\nWhy: Solid 2.0.0-rc.0 removes the JSX classList attribute in favor of the class attribute\'s object and array forms.\nGuidance: Read this complete intrinsic element, its classList value, and every class source. Move the classList value into the class attribute\'s object or array form, preserve static classes and conditional truthiness, and deliberately merge any existing class attribute on the same element. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the value or another class source is spread or forwarded, duplicate class sources have unclear precedence, getters or side effects could change evaluation order or frequency, or a focused rendering test does not prove the resulting static and conditional class tokens. Ask for the smallest focused rendering test or runtime observation that exposes the rendered class attribute across relevant states. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#classlist--class-objectarray-forms',
  'src/migration-sites.tsx:14:63 Move this Solid 2 legacy subpath static import.\nWhy: Solid 2 publishes solid-js/store from solid-js.\nGuidance: Change only this static import\'s module source and preserve its import form and quote style. Make and validate that edit yourself; this analyzer never edits or runs the target project. Stop: do not blindly rewrite this source if the import includes removed or renamed helpers such as unwrap, produce, createMutable, or modifyMutable. Migrate those bindings and call sites first, then move supported store imports to solid-js. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now',
  'src/migration-sites.tsx:15:24 Move this Solid web renderer static import.\nWhy: Solid 2 publishes the web renderer from @solidjs/web instead of the solid-js/web subpath.\nGuidance: Change only this static import\'s module source to @solidjs/web and preserve its import form and quote style. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now',
  'src/migration-sites.tsx:19:15 Manual review required: migrate this mergeProps call to a reviewed merge.\nWhy: Solid 2.0.0-rc.0 replaces mergeProps with merge, but merge treats a property that exists on a later source with the value undefined as the winner instead of falling through to an earlier source. This call has 2 semantic argument(s).\nGuidance: Read every source in argument order, list all overlapping keys, and trace every consumer of the merged value. Replace mergeProps with merge from solid-js only after proving that every later overlapping value is non-undefined and that zero-argument behavior, one-source result identity, and mutation semantics do not matter. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a replacement when existing TypeScript types or the inferred Merge result type are the only runtime-safety evidence, a source is any/unknown/union-typed at runtime, a props or store proxy, a function, or has getters or dynamic key presence, source or result identity or mutation is observed, or a consumer depends on fallback-through-undefined behavior. If old undefined-fallback behavior is required, preserve live reactive reads with a targeted manual guard at the disputed property boundary rather than object spread or Object.assign. Ask for the smallest focused test or runtime observation that exposes the disputed property\'s value, precedence, identity, and mutation boundary. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#mergeprops--splitprops--merge--omit',
  'src/migration-sites.tsx:20:33 Manual review required: migrate this splitProps tuple to reviewed omit-based values.\nWhy: Solid 2.0.0-rc.0 replaces splitProps with omit, but omit returns one object while splitProps returns a tuple containing one selected object per key group plus a final remainder, so migration depends on how those positions are consumed. This call has 1 key group(s).\nGuidance: Trace the complete tuple destructuring or other call-site use, list the exact keys represented by every group, and trace every downstream consumer and reactive property access for each selected value and the remainder. Design explicit omit-based values only after proving how every old tuple member will be produced and that live reactive property access is preserved. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a replacement when keys are dynamic or overlapping, more than one selected group is consumed, the tuple escapes or is indexed dynamically, rest destructuring or reassignment is involved, props or store proxy identity matters, or any consumer is unclear. Ask for the smallest focused test or runtime observation that exposes each consumed tuple member\'s keys, value, reactive updates, and identity boundary. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#mergeprops--splitprops--merge--omit',
  'src/migration-sites.tsx:21:16 Manual review required: migrate this createMemo initial value.\nWhy: Solid 1.x treats this call\'s second argument as its initial value, while Solid 2.0.0-rc.0 treats the second argument as options and has no initial-value argument.\nGuidance: Read the complete callback, the initial-value expression, its consumers, and nearby reactive state. Establish what the callback must receive on its first run and how later updates use the previous value. Preserve that behavior explicitly in surrounding state or callback logic before removing the legacy initial-value argument. For a three-argument call, review the legacy options separately and move only options supported by Solid 2.0.0-rc.0 into the second-argument position; for a two-argument call, do not reinterpret an option-shaped initial value as options. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when first-run or previous-value behavior is unclear, the initial-value expression has meaningful evaluation timing or side effects, options are dynamic or their compatibility is unknown, the callback writes to its inputs or may form a cycle, or ownership and consumers are unclear. Ask for the smallest focused test or runtime observation that exposes the first computed value and subsequent updates. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup',
  'src/migration-sites.tsx:22:23 Manual review required: migrate this createMutable call to an owned createStore tuple.\nWhy: Solid 2.0.0-rc.0 removes createMutable in favor of createStore, which returns a store-and-setter tuple rather than the directly mutable proxy this call creates. This call has exactly 1 semantic argument(s), so its initial value and any second options argument require review before the value and every write can move to that tuple.\nGuidance: Trace the created value through every alias, return, call site, and write, identify its owner and every reader and writer, and review a second options argument separately. Introduce createStore only after mapping every property assignment, delete, and mutating array operation to the tuple\'s explicit setter, including the exact setter path or draft-first setter callback needed to preserve selection and sequencing. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the value escapes, a consumer requires direct mutation or proxy identity, mutation happens through an unknown helper, setter paths cannot be identified, ownership is unclear, or focused tests do not cover the affected reads and writes. Ask for the smallest focused test or runtime observation that exposes the value\'s reads, writes, identity, and ownership boundary. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#createmutable--modifymutable--createstore-with-draft-setters',
  'src/migration-sites.tsx:23:1 Manual review required: migrate this modifyMutable call to its target store\'s setter.\nWhy: Solid 2.0.0-rc.0 removes modifyMutable; a createStore tuple\'s draft-first setter can replace this mutation entry point only after the target is resolved to its store owner, the complete recipe is reviewed, and the exact setter mapping is established.\nGuidance: Resolve the first target argument to its exact createMutable owner and planned createStore tuple, inspect the complete second-argument mutation recipe, and map that recipe to the owner\'s explicit setter while preserving the setter overload, path selection, and update sequencing. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the target origin or setter is unknown, the state or recipe escapes, mutation is delegated to an unknown helper, the callback returns a meaningful value, nested updates or async work are present, or focused tests do not expose the affected reads and writes. Ask for the smallest focused test or runtime observation that exposes the selected target owner, setter path, recipe result, and resulting store update. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#createmutable--modifymutable--createstore-with-draft-setters',
  'src/migration-sites.tsx:26:22 Manual review required: migrate this unwrap call to a reviewed snapshot.\nWhy: Solid 2.0.0-rc.0 replaces unwrap(store) with snapshot(store) for capturing a point-in-time, non-reactive snapshot of a Solid store, but replacement safety depends on the input, capture time, and every consumer.\nGuidance: Read the complete input expression and prove it is a Solid store, then trace every consumer of the unwrap result. Replace unwrap with snapshot from solid-js only after proving that a point-in-time snapshot is intended, and preserve the exact surrounding evaluation point so capture timing and side effects do not move. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a replacement when the input\'s store provenance is unclear, the current value\'s object or nested identity is observed, the value is expected to remain live across store updates, the result or nested data is mutated, the result escapes or is passed to code with unknown ownership, or any consumer is unclear. Ask for the smallest focused test or runtime observation that exposes the disputed capture or consumer boundary at this site, such as the result before and after a store update, nested reads, identity, mutation, serialization, or ownership transfer. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#unwrapstore--snapshotstore',
  'src/migration-sites.tsx:27:22 Manual review required: migrate this produce wrapper to draft-first setter behavior.\nWhy: Solid 2.0.0-rc.0 store setters are draft-first and receive a mutable draft in their mutation callback, so a legacy produce wrapper is unnecessary only after the surrounding call is proven to use the intended store-setter overload.\nGuidance: Read the immediate parent call, identify the exact store setter overload and any path arguments, and review the full mutation callback. Pass the callback directly to the setter only after proving that this wrapper supplies that setter\'s mutation callback. For nested produce calls, review each wrapper, its containing call, and its full callback independently. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing wrapper removal when the result is stored, returned, composed, passed through another function, used with a non-store setter, or when callback returns, nested control flow, async work, external mutation, or target ownership make draft behavior unclear. Ask for the smallest focused test or runtime observation that exposes the selected setter overload and resulting store update. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#produce--now-the-default-setter-behavior',
  'src/migration-sites.tsx:31:1 Manual review required: choose a Solid 2 replacement for this createComputed call.\nWhy: Solid 2.0.0-rc.0 removes createComputed; the correct replacement depends on whether the callback derives a value, performs an effect, or encodes stateful update logic. This call has 1 semantic argument(s).\nGuidance: Read the complete callback, its consumers, nearby signal/store declarations, and ordering assumptions. Use createMemo only for a readonly derived value that consumers read. Use Solid 2\'s split createEffect when reactive reads can be isolated in the compute callback and imperative work belongs in the untracked effect callback. Use function-form createSignal, or derived createStore for object and array projections, only when writable derived state is intentional. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the callback uses its previous value or an initial/options argument, writes to a dependency or may form a cycle, mixes several operations, relies on immediate or render ordering, registers cleanup, starts async work, contains nested control flow or reactive primitive creation, or has unclear ownership or consumers. Ask for the smallest focused test or runtime observation that exposes the required value, timing, and write behavior. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#createcomputed--creatememo-createeffect-or-derived-createsignal',
  'src/migration-sites.tsx:32:1 Manual review required: split this one-argument createEffect into compute and apply callbacks.\nWhy: Solid 2 requires separate compute and apply callbacks; the correct split depends on which reads are reactive inputs and which statements are side effects.\nGuidance: Read the full callback, imports, and nearby reactive declarations. Identify the reactive reads that should trigger the effect, move those reads into the compute callback, return the value the side effect needs, and perform the imperative operation in the apply callback without adding reactive dependencies. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the effect contains cleanup, async work, nested control flow affecting reads, reactive primitive creation, unrelated operations, writes that may affect its own inputs, or unclear intent. Ask for the smallest focused test or runtime observation that makes the missing behavior decision observable. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup',
  'src/migration-sites.tsx:36:1 Manual review required: migrate this onMount lifecycle callback.\nWhy: Solid 2 removes onMount; onSettled is its closest replacement and can return an owner-bound cleanup function, but the correct migration depends on the callback\'s ownership, required timing, and cleanup behavior.\nGuidance: Read the complete callback, its owner, and nearby cleanup registration. Establish who owns the work, when it must run relative to rendering and settling, and what must be disposed. Move the work to onSettled only after proving that timing is compatible, and return owner-bound cleanup from the onSettled callback. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the callback registers cleanup, starts async work, contains nested control flow that changes lifecycle behavior, creates reactive primitives, or has unclear ownership. Ask for the smallest focused test or runtime observation that makes the required timing and cleanup behavior observable. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup',
  'src/migration-sites.tsx:42:5 Manual review required: migrate this imported Suspense JSX site to Loading.\nWhy: Solid 2 replaces the solid-js Suspense component with Loading for initial not-ready fallback UI.\nGuidance: Read this complete boundary, its fallback, children, props, and corresponding import. Replace the unaliased named Suspense import and this JSX component with Loading only after confirming that the boundary owns initial not-ready UI and that its fallback and children preserve their rendering behavior. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when props are spread or forwarded, fallback ownership or evaluation is indirect, nested async boundaries make the intended initial-loading behavior unclear, or focused rendering tests do not cover the fallback and ready states. Ask for the smallest focused test or runtime observation that exposes both states. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#suspense--errorboundary--loading--errored',
  'src/migration-sites.tsx:43:7 Manual review required: migrate this imported ErrorBoundary JSX site to Errored.\nWhy: Solid 2 replaces the solid-js ErrorBoundary component with Errored, whose fallback receives an error accessor rather than a raw error value.\nGuidance: Read this complete boundary, its fallback, children, props, and corresponding import. Replace the unaliased named ErrorBoundary import and this JSX component with Errored only after updating every fallback use to read the error accessor, such as err(), while preserving error ownership and recovery behavior. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when props are spread or forwarded, the fallback is indirect or escapes, the error value is passed to unknown code, reset or recovery behavior is unclear, or focused tests do not cover thrown and recovered states. Ask for the smallest focused test or runtime observation that exposes the fallback value and recovery behavior. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#suspense--errorboundary--loading--errored',
  'src/migration-sites.tsx:44:9 Manual review required: migrate this imported SuspenseList JSX site to Reveal.\nWhy: Solid 2 replaces SuspenseList with Reveal for coordinating sibling Loading boundaries and replaces revealOrder and tail controls with order and collapsed semantics.\nGuidance: Read the complete group, its revealOrder and tail values, children, nesting, props, and corresponding import. Replace the unaliased named SuspenseList import and this JSX component with Reveal only after mapping literal revealOrder="forwards" to the default or order="sequential", revealOrder="together" to order="together", and tail="collapsed" to collapsed only under sequential order; review the children as sibling Loading boundaries, and do not use the earlier-beta boolean together prop. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when props are spread or forwarded, revealOrder or tail is dynamic or has another value, child boundary ownership or nesting is unclear, intended reveal timing cannot be established, or focused behavior tests do not cover the coordinated states. Ask for the smallest focused test or runtime observation that exposes ordering, fallback, and collapsed-tail behavior. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#coordinating-loading-boundaries-suspenselist--reveal',
  'src/migration-sites.tsx:45:11 Manual review required: migrate this imported Index JSX site to For keyed={false}.\nWhy: Solid 2 removes Index; its direct replacement is For with keyed={false}, whose child callback receives an item accessor and a stable numeric index.\nGuidance: Read the complete list site, its each value, child callback, props, and corresponding import. Replace the unaliased named Index import and this JSX component with For, add the literal keyed={false} mode, and review the callback so the item remains an accessor and the index remains a stable number. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when props are spread or forwarded, each or the child callback is indirect, callback parameters escape to unknown code, item identity or index behavior is unclear, or focused list-update tests do not prove state preservation. Ask for the smallest focused test or runtime observation that covers insertion, removal, reordering, and item updates. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#list-rendering-index-is-gone-and-for-handles-each-keying-mode',
  'src/migration-sites.tsx:47:23 Manual review required: migrate this intrinsic JSX classList attribute to class.\nWhy: Solid 2.0.0-rc.0 removes the JSX classList attribute in favor of the class attribute\'s object and array forms.\nGuidance: Read this complete intrinsic element, its classList value, and every class source. Move the classList value into the class attribute\'s object or array form, preserve static classes and conditional truthiness, and deliberately merge any existing class attribute on the same element. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the value or another class source is spread or forwarded, duplicate class sources have unclear precedence, getters or side effects could change evaluation order or frequency, or a focused rendering test does not prove the resulting static and conditional class tokens. Ask for the smallest focused rendering test or runtime observation that exposes the rendered class attribute across relevant states. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#classlist--class-objectarray-forms',
  'src/nonmatches.tsx:10:32 Move this Solid web renderer require() call.\nWhy: Solid 2 publishes the web renderer from @solidjs/web instead of the solid-js/web subpath.\nGuidance: Change only this require call\'s module source to @solidjs/web and preserve its quote style. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now',
  'src/nonmatches.tsx:11:24 Move this Solid web renderer dynamic import().\nWhy: Solid 2 publishes the web renderer from @solidjs/web instead of the solid-js/web subpath.\nGuidance: Change only this dynamic import\'s module source to @solidjs/web and preserve its quote style. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now',
  'src/nonmatches.tsx:4:1 Manual review required: split this one-argument createEffect into compute and apply callbacks.\nWhy: Solid 2 requires separate compute and apply callbacks; the correct split depends on which reads are reactive inputs and which statements are side effects.\nGuidance: Read the full callback, imports, and nearby reactive declarations. Identify the reactive reads that should trigger the effect, move those reads into the compute callback, return the value the side effect needs, and perform the imperative operation in the apply callback without adding reactive dependencies. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the effect contains cleanup, async work, nested control flow affecting reads, reactive primitive creation, unrelated operations, writes that may affect its own inputs, or unclear intent. Ask for the smallest focused test or runtime observation that makes the missing behavior decision observable. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup',
  'src/nonmatches.tsx:5:1 Manual review required: split this one-argument createEffect into compute and apply callbacks.\nWhy: Solid 2 requires separate compute and apply callbacks; the correct split depends on which reads are reactive inputs and which statements are side effects.\nGuidance: Read the full callback, imports, and nearby reactive declarations. Identify the reactive reads that should trigger the effect, move those reads into the compute callback, return the value the side effect needs, and perform the imperative operation in the apply callback without adding reactive dependencies. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the effect contains cleanup, async work, nested control flow affecting reads, reactive primitive creation, unrelated operations, writes that may affect its own inputs, or unclear intent. Ask for the smallest focused test or runtime observation that makes the missing behavior decision observable. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup',
  'src/nonmatches.tsx:7:24 Move this Solid web renderer re-export.\nWhy: Solid 2 publishes the web renderer from @solidjs/web instead of the solid-js/web subpath.\nGuidance: Change only this re-export\'s module source to @solidjs/web and preserve its export form and quote style. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now',
  'src/nonmatches.tsx:8:30 Move this Solid web renderer dynamic import().\nWhy: Solid 2 publishes the web renderer from @solidjs/web instead of the solid-js/web subpath.\nGuidance: Change only this dynamic import\'s module source to @solidjs/web and preserve its quote style. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now',
  'src/workspace-reference.tsx:3:32 Manual review required: migrate this mergeProps call to a reviewed merge.\nWhy: Solid 2.0.0-rc.0 replaces mergeProps with merge, but merge treats a property that exists on a later source with the value undefined as the winner instead of falling through to an earlier source. This call has 2 semantic argument(s).\nGuidance: Read every source in argument order, list all overlapping keys, and trace every consumer of the merged value. Replace mergeProps with merge from solid-js only after proving that every later overlapping value is non-undefined and that zero-argument behavior, one-source result identity, and mutation semantics do not matter. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a replacement when existing TypeScript types or the inferred Merge result type are the only runtime-safety evidence, a source is any/unknown/union-typed at runtime, a props or store proxy, a function, or has getters or dynamic key presence, source or result identity or mutation is observed, or a consumer depends on fallback-through-undefined behavior. If old undefined-fallback behavior is required, preserve live reactive reads with a targeted manual guard at the disputed property boundary rather than object spread or Object.assign. Ask for the smallest focused test or runtime observation that exposes the disputed property\'s value, precedence, identity, and mutation boundary. Official migration guide: https://github.com/solidjs/solid/blob/ff4d3c4479163fbdd3327f5b22d0c3ea7bd1a2c5/documentation/solid-2.0/MIGRATION.md#mergeprops--splitprops--merge--omit'
];

test(
  "prints the exact deduplicated, sorted guidance once per run and leaves the target untouched",
  { timeout: 180_000 },
  () => {
    // The analyzers are one parallel group, so the bridge processes of this
    // run overlap up to the engine's admission capacity. Byte-identical
    // output across runs is what proves the aggregation does not depend on
    // the order in which those commands happen to finish, and the unchanged
    // tree snapshot is what proves no analyzer wrote to the target.
    const before = treeSnapshot(fixtureDirectory);
    const runs = [1, 2].map(() => runLauncher(["--target", fixtureDirectory]));
    for (const [index, run] of runs.entries()) {
      assert.equal(run.status, 0, `run ${index + 1}: ${run.stderr}`);
      assert.equal(run.stdout, expectedStdout(expectedGuidance));
      assert.equal(run.stderr, `${DISCLOSURE}\n`);
      assertDetectionOnlyTerminalOutput(run.stdout);
    }
    assert.deepEqual(
      Buffer.from(runs[0].stdout, "utf8"),
      Buffer.from(runs[1].stdout, "utf8"),
    );
    assert.deepEqual(
      treeSnapshot(fixtureDirectory),
      before,
      "the analyzer changed its target",
    );
    assertNoPersistentArtifacts(fixtureDirectory);
  },
);

test(
  "resolves cross-file and binding-resolved call sites through the workspace semantic index",
  { timeout: 180_000 },
  () => {
    // src/workspace-reference.tsx calls mergeProps through the re-export in
    // src/workspace-export.ts. The finding is discovered from the exporting
    // file's import binding via references(), so it must disappear with that
    // file, and the aliased and namespace calls in src/nonmatches.tsx must
    // keep being resolved by binding rather than by name.
    const crossFile = expectedGuidance.filter((entry) =>
      entry.startsWith("src/workspace-reference.tsx:"),
    );
    assert.equal(crossFile.length, 1);
    assert.equal(
      expectedGuidance.filter((entry) =>
        /^src\/nonmatches\.tsx:[45]:1 /.test(entry),
      ).length,
      2,
    );

    const surface = mkdtempSync(join(tmpdir(), "sma-workspace-"));
    try {
      const target = join(surface, "target");
      cpSync(fixtureDirectory, target, { recursive: true });
      const complete = runLauncher(["--target", target]);
      assert.equal(complete.status, 0, complete.stderr);
      assert.equal(complete.stdout, expectedStdout(expectedGuidance));

      rmSync(join(target, "src/workspace-export.ts"));
      const partial = runLauncher(["--target", target]);
      assert.equal(partial.status, 0, partial.stderr);
      assert.equal(
        partial.stdout,
        expectedStdout(
          expectedGuidance.filter((entry) => !crossFile.includes(entry)),
        ),
      );
    } finally {
      rmSync(surface, { recursive: true, force: true });
    }
  },
);

test(
  "defaults the target to the invocation directory and resolves a relative --target",
  { timeout: 180_000 },
  () => {
    const defaulted = runLauncher([], { cwd: fixtureDirectory });
    assert.equal(defaulted.status, 0, defaulted.stderr);
    assert.equal(defaulted.stdout, expectedStdout(expectedGuidance));
    assert.equal(defaulted.stderr, `${DISCLOSURE}\n`);

    const relativeTarget = runLauncher(["analyze", "--target", "tests/fixture"], {
      cwd: packageDirectory,
    });
    assert.equal(relativeTarget.status, 0, relativeTarget.stderr);
    assert.equal(relativeTarget.stdout, expectedStdout(expectedGuidance));
    assert.equal(relativeTarget.stderr, `${DISCLOSURE}\n`);
  },
);

test(
  "prints only the disclosure for a target without supported sites",
  { timeout: 180_000 },
  () => {
    const before = treeSnapshot(emptyDirectory);
    const result = runLauncher(["--target", emptyDirectory]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `${DISCLOSURE}\n`);
    assert.deepEqual(treeSnapshot(emptyDirectory), before);
    assertNoPersistentArtifacts(emptyDirectory);
  },
);

test("ends usage and target failures with the disclosure and exit code 2 before any engine starts", () => {
  // The launcher resolves targets against the child's real working
  // directory, so the expected paths must be real paths too.
  const surface = realpathSync.native(mkdtempSync(join(tmpdir(), "sma-usage-")));
  const fileTarget = join(surface, "file-target");
  writeFileSync(fileTarget, "not a directory\n");
  // A bridge that would fail loudly if the launcher started the engine anyway.
  const env = { CODEMOD_BRIDGE_BIN: join(surface, "never-built") };

  try {
    const cases = [
      {
        argumentsList: ["--unknown"],
        expected: "[solid-migration-assistant] unknown argument: --unknown",
      },
      {
        argumentsList: ["--target", "missing"],
        expected: `[solid-migration-assistant] target does not exist: ${join(surface, "missing")}`,
      },
      {
        argumentsList: ["--target", fileTarget],
        expected: `[solid-migration-assistant] target is not a directory: ${fileTarget}`,
      },
    ];
    for (const { argumentsList, expected } of cases) {
      const result = runLauncher(argumentsList, { cwd: surface, env });
      assert.equal(result.status, 2, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, `${expected}\n${DISCLOSURE}\n`);
    }
  } finally {
    rmSync(surface, { recursive: true, force: true });
  }
});

test("locates the bridge beside the linked orchestration checkout unless CODEMOD_BRIDGE_BIN overrides it", () => {
  const resolved = resolveBridgeBinary({});
  assert.match(resolved, /[\\/]target[\\/]debug[\\/]butterflow-execution-bridge$/);
  assert.equal(existsSync(resolved), true, `build the bridge first: ${resolved}`);
  assert.equal(
    resolveBridgeBinary({ CODEMOD_BRIDGE_BIN: "custom/bridge" }),
    resolve("custom/bridge"),
  );
});

test("reports a missing bridge on stderr, exits 1, and prints no guidance", () => {
  const surface = mkdtempSync(join(tmpdir(), "sma-bridge-"));
  try {
    const missing = join(surface, "missing-bridge");
    const result = runLauncher(["--target", fixtureDirectory], {
      env: { CODEMOD_BRIDGE_BIN: missing },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      `[solid-migration-assistant] analyzer execution failed: bridge binary not found at ${missing}; build it with 'cargo build -p butterflow-execution-bridge' in the codemod checkout that provides @codemod.com/orchestration, or point CODEMOD_BRIDGE_BIN at a build\n${DISCLOSURE}\n`,
    );
  } finally {
    rmSync(surface, { recursive: true, force: true });
  }
});

test(
  "reports a failed command with its status, exits 1, and leaves the target untouched",
  { timeout: 180_000 },
  () => {
    const surface = mkdtempSync(join(tmpdir(), "sma-failure-"));
    try {
      const bridge = fakeBridge(surface, "exit 7");
      const before = treeSnapshot(fixtureDirectory);
      const result = runLauncher(["--target", fixtureDirectory], {
        env: { CODEMOD_BRIDGE_BIN: bridge },
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      // The analyzers are a parallel group, so the failure that surfaces is
      // whichever admitted command rejects first rather than a fixed one.
      // Everything around the command name stays exact.
      const failed = analyzerNameIn(
        result.stderr,
        /command '(\w+)' failed: bridge exited with code 7 and wrote no response/,
      );
      assert.equal(
        result.stderr,
        `[solid-migration-assistant] analyzer execution failed: command '${failed}' failed: bridge exited with code 7 and wrote no response\n${DISCLOSURE}\n`,
      );
      assert.deepEqual(treeSnapshot(fixtureDirectory), before);
    } finally {
      rmSync(surface, { recursive: true, force: true });
    }
  },
);

test(
  "cancels the commands in flight on SIGINT, kills their bridges, refuses the queued ones, and still ends with the disclosure",
  { timeout: 60_000 },
  async () => {
    const surface = mkdtempSync(join(tmpdir(), "sma-cancel-"));
    try {
      // Every admitted command writes its own pid file, so the test can kill
      // the run while an unknown number of bridges are in flight and still
      // prove that all of them died.
      const pidDirectory = join(surface, "pids");
      mkdirSync(pidDirectory);
      const bridge = fakeBridge(
        surface,
        `echo $$ > "${pidDirectory}/$$"\nexec sleep 60`,
      );
      const output = { stdout: "", stderr: "" };
      const child = spawn(process.execPath, [launcher, "--target", fixtureDirectory], {
        cwd: packageDirectory,
        env: { ...process.env, CODEMOD_BRIDGE_BIN: bridge },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.setEncoding("utf8").on("data", (chunk) => {
        output.stdout += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk) => {
        output.stderr += chunk;
      });
      const exited = new Promise((resolveExit) => {
        child.once("exit", (code, signal) => resolveExit({ code, signal }));
      });

      await waitFor(
        () => readdirSync(pidDirectory).length > 0,
        "a bridge to start",
      );
      child.kill("SIGINT");
      const exit = await exited;

      assert.deepEqual(exit, { code: 1, signal: null });
      assert.equal(output.stdout, "");
      // A member of the group is either admitted, and its bridge is killed,
      // or still queued for capacity, and is refused without spawning
      // anything. Either is a correct cancellation; which one surfaces
      // depends on how far the group had progressed.
      const cancelled = analyzerNameIn(
        output.stderr,
        /command '(\w+)' cancelled: (?:bridge killed by SIGKILL on abort|cancelled while queued for execution capacity)/,
      );
      const reason = /cancelled: (.+)\n/.exec(output.stderr)[1];
      assert.ok(
        [
          "bridge killed by SIGKILL on abort",
          "cancelled while queued for execution capacity",
        ].includes(reason),
        reason,
      );
      assert.equal(
        output.stderr,
        `[solid-migration-assistant] analyzer execution failed: command '${cancelled}' cancelled: ${reason}\n${DISCLOSURE}\n`,
      );
      const pids = readdirSync(pidDirectory).map((name) =>
        Number.parseInt(readFileSync(join(pidDirectory, name), "utf8"), 10),
      );
      assert.ok(pids.length > 0);
      await waitFor(
        () => pids.every((pid) => !isAlive(pid)),
        "every started bridge to be killed",
      );
    } finally {
      rmSync(surface, { recursive: true, force: true });
    }
  },
);

test("bundles each rule with its imported helpers into a self-contained transform artifact", async () => {
  const { buildFile } = await import("@codemod.com/orchestration");

  const analyze = buildFile(analyzeWorkflow);
  assert.deepEqual(
    analyze.artifacts.map((artifact) => artifact.name),
    expectedAnalyzers,
  );
  assert.equal(new Set(analyze.artifacts.map((artifact) => artifact.hash)).size, 37);
  assert.equal(
    (
      analyze.source.match(
        /transform: \{"name":"analyze[A-Za-z0-9]+","hash":"[0-9a-f]{64}"\}/g,
      ) ?? []
    ).length,
    37,
  );
  for (const artifact of analyze.artifacts) {
    assertSelfContainedArtifact(artifact, "analyzeFile");
  }
  // Binding-resolved rules reach the workspace index through the bundled
  // shared scanner, not through anything the sandbox must resolve on disk.
  const mergeProps = analyze.artifacts.find(
    (artifact) => artifact.name === "analyzeMergeProps",
  );
  assert.match(mergeProps.source, /function findImportedCalls\(/);
  assert.match(mergeProps.source, /\.references\(\)/);

  const transform = buildFile(transformWorkflow);
  assert.deepEqual(
    transform.artifacts.map((artifact) => artifact.name),
    expectedRewrites,
  );
  for (const artifact of transform.artifacts) {
    assertSelfContainedArtifact(artifact, "transformFile");
    assert.match(artifact.source, /commitEdits\(/);
  }
});

test("declares the 37 analyzers as one parallel group of workspace-semantic commands and aggregates every output despite out-of-order completion", async () => {
  const { AdmissionScheduler, loadWorkflow, run } = await import(
    "@codemod.com/orchestration"
  );
  const { exports, artifacts } = await loadWorkflow(analyzeWorkflow);
  const { executor, requests, completionOrder, peakInFlight } = reversingExecutor(
    {
      analyzeWebImport: [["b\nsecond line", "a"], ["a"]],
      analyzeUnwrap: [["c"], ["a"]],
    },
    expectedAnalyzers.length,
  );

  const result = await run(exports.default, {
    executor,
    // Enough capacity for every member, so admission never serialises the
    // group and the executor alone decides the completion order.
    scheduler: new AdmissionScheduler({ capacity: expectedAnalyzers.length * 4 }),
  });

  // The group is declared once over the whole list: all 37 are in flight
  // together, and each one finishes only after every analyzer declared after
  // it has already finished.
  assert.equal(peakInFlight(), expectedAnalyzers.length);
  assert.deepEqual(completionOrder(), [...expectedAnalyzers].reverse());
  // The exact same aggregate as a one-at-a-time run: flattened, exact
  // deduplicated, and sorted as whole strings.
  assert.deepEqual(result.output, ["a", "b\nsecond line", "c"]);
  assert.equal(result.replayed, false);
  // Commands are still issued in declaration order, so command identity and
  // history do not depend on the schedule.
  assert.deepEqual(
    requests.map((request) => request.commandId),
    expectedAnalyzers,
  );
  for (const request of requests) {
    assert.equal(request.protocolVersion, 5);
    assert.equal(request.context, undefined);
    const { operation } = request;
    assert.deepEqual(Object.keys(operation).sort(), [
      "exclude",
      "include",
      "kind",
      "language",
      "semanticAnalysis",
      "transform",
    ]);
    assert.equal(operation.kind, "jssg");
    assert.equal(operation.language, "tsx");
    assert.deepEqual(operation.include, SOURCE_INCLUDE);
    assert.deepEqual(operation.exclude, SOURCE_EXCLUDE);
    assert.equal(operation.semanticAnalysis, "workspace");
    assert.equal(operation.transform.name, request.commandId);
    assert.ok(artifacts.has(operation.transform.hash), request.commandId);
  }
});

test("lets the engine's admission scheduler, not the group, decide how many analyzers run at once", async () => {
  const { AdmissionScheduler, loadWorkflow, run } = await import(
    "@codemod.com/orchestration"
  );
  const { exports } = await loadWorkflow(analyzeWorkflow);
  // Two workspace-semantic batches fit in eight units at the engine's weight
  // of four each; the ninth unit a third batch would need is not available.
  const capacity = 8;
  const scheduler = new AdmissionScheduler({ capacity });
  const { executor, weights, admitted } = boundedGroupExecutor(
    scheduler,
    expectedAnalyzers.length,
  );

  const result = await run(exports.default, { executor, scheduler });

  assert.deepEqual(result.output, []);
  assert.deepEqual([...new Set(weights())], [4]);
  assert.deepEqual(admitted().sort(), [...expectedAnalyzers].sort());
  // The scheduler's own accounting: the group did overlap, and it never
  // exceeded the budget while doing so.
  const stats = scheduler.stats();
  assert.equal(stats.capacity, capacity);
  assert.equal(stats.peakActive, 2);
  assert.equal(stats.peakUsed, capacity);
  assert.deepEqual({ used: stats.used, active: stats.active, queued: stats.queued }, {
    used: 0,
    active: 0,
    queued: 0,
  });
});

test(
  "bounds the bridge processes a real run starts to the engine's admission capacity",
  { timeout: 180_000 },
  async () => {
    const surface = mkdtempSync(join(tmpdir(), "sma-capacity-"));
    try {
      // Eight units admit two workspace-semantic analyzers at a time. Each
      // stand-in bridge registers itself, then waits until it can see a peer,
      // so the run cannot pass unless the scheduler really overlaps two
      // commands; it records the most bridges it ever saw alive at once, so
      // the run also cannot pass if the scheduler overlaps three. The last
      // odd member has no peer and gives up after its own bounded wait.
      const live = join(surface, "live");
      mkdirSync(live);
      const observed = join(surface, "observed");
      const bridge = fakeBridge(
        surface,
        [
          `live="${live}"`,
          `: > "$live/$$"`,
          "peak=0",
          "attempt=0",
          "while [ $attempt -lt 100 ]; do",
          `  count=$(ls "$live" | wc -l | tr -d ' ')`,
          '  [ "$count" -gt "$peak" ] && peak="$count"',
          '  [ "$count" -ge 2 ] && break',
          "  attempt=$((attempt + 1))",
          "  sleep 0.05",
          "done",
          `echo "$peak" >> "${observed}"`,
          `rm -f "$live/$$"`,
          "exit 7",
        ].join("\n"),
      );
      const before = treeSnapshot(fixtureDirectory);
      const result = runLauncher(["--target", fixtureDirectory], {
        env: {
          CODEMOD_BRIDGE_BIN: bridge,
          CODEMOD_ORCHESTRATION_CAPACITY: "8",
        },
      });

      // Every member still runs even though the group already failed.
      const peaks = readFileSync(observed, "utf8")
        .trim()
        .split("\n")
        .map((line) => Number.parseInt(line, 10));
      assert.equal(peaks.length, expectedAnalyzers.length);
      assert.deepEqual(
        { mostSeenAtOnce: Math.max(...peaks), overBudget: peaks.filter((peak) => peak > 2) },
        { mostSeenAtOnce: 2, overBudget: [] },
      );
      assert.deepEqual(readdirSync(live), [], "a bridge outlived its command");
      // Read-only commands, so a bounded concurrent run still writes nothing.
      assert.deepEqual(treeSnapshot(fixtureDirectory), before);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      const failed = analyzerNameIn(
        result.stderr,
        /command '(\w+)' failed: bridge exited with code 7 and wrote no response/,
      );
      assert.equal(
        result.stderr,
        `[solid-migration-assistant] analyzer execution failed: command '${failed}' failed: bridge exited with code 7 and wrote no response\n${DISCLOSURE}\n`,
      );
    } finally {
      rmSync(surface, { recursive: true, force: true });
    }
  },
);

test("issues the three rewrites as separate sequential commands without semantic analysis and returns the report as data", async () => {
  const { loadWorkflow, run } = await import("@codemod.com/orchestration");
  const { exports, artifacts } = await loadWorkflow(transformWorkflow);
  const { executor, requests, overlapped } = scriptedExecutor({
    relocateWebPackage: [["y"], ["x"]],
    rewriteClassListToClass: [["x", "z"]],
  });

  const result = await run(exports.default, { executor });

  assert.deepEqual(result.output, { report: ["x", "y", "z"] });
  // The default capacity would admit more than one of these, so the rewrites
  // stay sequential because the workflow awaits them one at a time, not
  // because the scheduler ran out of room.
  assert.equal(overlapped(), false, "rewrites were not awaited one at a time");
  assert.deepEqual(
    requests.map((request) => request.commandId),
    expectedRewrites,
  );
  for (const request of requests) {
    const { operation } = request;
    assert.deepEqual(Object.keys(operation).sort(), [
      "exclude",
      "include",
      "kind",
      "language",
      "transform",
    ]);
    assert.equal(operation.language, "tsx");
    assert.deepEqual(operation.include, SOURCE_INCLUDE);
    assert.deepEqual(operation.exclude, SOURCE_EXCLUDE);
    assert.equal(operation.transform.name, request.commandId);
    assert.ok(artifacts.has(operation.transform.hash), request.commandId);
  }
});

function runLauncher(argumentsList, { cwd = packageDirectory, env = {} } = {}) {
  return spawnSync(process.execPath, [launcher, ...argumentsList], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
}

function expectedStdout(guidance) {
  return guidance.length === 0 ? "" : `${guidance.join("\n\n")}\n`;
}

/** A stand-in bridge binary: a shell script the launcher spawns instead of the Rust build. */
function fakeBridge(directory, body) {
  const path = join(directory, "fake-bridge");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(condition, what, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
}

function assertSelfContainedArtifact(artifact, adapter) {
  assert.match(artifact.hash, /^[0-9a-f]{64}$/);
  assert.match(artifact.source, new RegExp(`function ${artifact.name}\\(`));
  assert.match(artifact.source, new RegExp(`function ${adapter}\\(`));
  assert.match(artifact.source, /export \{[^}]*default[^}]*\}/);
  assert.doesNotMatch(artifact.source, /from "\.{1,2}\//);
  assert.doesNotMatch(artifact.source, /@codemod\.com\/orchestration/);
  assert.doesNotMatch(artifact.source, /codemod:workflow/);
}

/**
 * An executor that answers every JSSG command from a script instead of a
 * bridge, records each request, and notices when two commands overlap.
 */
function scriptedExecutor(outputs) {
  const requests = [];
  let inFlight = 0;
  let overlapped = false;
  return {
    requests,
    overlapped: () => overlapped,
    executor: {
      async execute(request) {
        inFlight += 1;
        if (inFlight > 1) overlapped = true;
        requests.push(request);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1));
        inFlight -= 1;
        return {
          protocolVersion: 5,
          commandId: request.commandId,
          status: "succeeded",
          output: outputs[request.commandId] ?? [],
        };
      },
    },
  };
}

/**
 * An executor that answers every JSSG command from a script, keeps every
 * command in flight until all `memberCount` of them have arrived, and then
 * completes them in the exact reverse of their declaration order. Nothing
 * here is timed, so the out-of-order completion is deterministic.
 */
function reversingExecutor(outputs, memberCount) {
  const requests = [];
  const completed = [];
  let peak = 0;
  let allArrived;
  const arrived = new Promise((resolve) => {
    allArrived = resolve;
  });
  // `successors[index]` settles once every later member has completed;
  // the sentinel past the last member is already settled.
  const successors = Array.from({ length: memberCount + 1 }, () => {
    let settle;
    const promise = new Promise((resolve) => {
      settle = resolve;
    });
    return { promise, settle };
  });
  successors[memberCount].settle();

  return {
    requests,
    completionOrder: () => completed,
    peakInFlight: () => peak,
    executor: {
      async execute(request) {
        const index = requests.length;
        requests.push(request);
        peak = Math.max(peak, requests.length - completed.length);
        if (requests.length === memberCount) allArrived();

        await arrived;
        await successors[index + 1].promise;
        completed.push(request.commandId);
        successors[index].settle();
        return {
          protocolVersion: 5,
          commandId: request.commandId,
          status: "succeeded",
          output: outputs[request.commandId] ?? [],
        };
      },
    },
  };
}

/**
 * An executor that holds every admitted command until `scheduler` has
 * admitted as many as its capacity allows, or as many as the group has left.
 * It never releases early, so the scheduler's own peak is the real bound
 * rather than a sample of one moment.
 */
function boundedGroupExecutor(scheduler, memberCount) {
  const admitted = [];
  const weights = [];
  let live = 0;
  let finished = 0;
  let waiting = [];

  return {
    admitted: () => admitted,
    weights: () => weights,
    executor: {
      async execute(request) {
        const weight = scheduler.weightFor(request.operation);
        weights.push(weight);
        admitted.push(request.commandId);
        const bound = Math.max(1, Math.floor(scheduler.capacity / weight));
        live += 1;
        await new Promise((resolve) => {
          waiting.push(resolve);
          if (live === Math.min(bound, memberCount - finished)) {
            const release = waiting;
            waiting = [];
            for (const settle of release) settle();
          }
        });
        live -= 1;
        finished += 1;
        return {
          protocolVersion: 5,
          commandId: request.commandId,
          status: "succeeded",
          output: [],
        };
      },
    },
  };
}

/** The analyzer name a diagnostic reports, proven to be one of the 37. */
function analyzerNameIn(stderr, pattern) {
  const match = pattern.exec(stderr);
  assert.ok(match, stderr);
  assert.ok(expectedAnalyzers.includes(match[1]), match[1]);
  return match[1];
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function assertDetectionOnlyTerminalOutput(value) {
  assert.doesNotMatch(
    stripAnsi(value),
    /codemod-reports|migration report|safe-transform|agent-guided|confidence/i,
  );
}

function assertNoPersistentArtifacts(target) {
  for (const path of [
    ".codemod",
    ".codemod-reports",
    "build",
    "coverage",
    "dist",
  ]) {
    assert.equal(existsSync(join(target, path)), false, path);
  }
}

function treeSnapshot(root) {
  const snapshot = {};
  visit(root, root, snapshot);
  return snapshot;
}

function visit(root, directory, snapshot) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      snapshot[`directory:${relativePath}`] = true;
      visit(root, path, snapshot);
      continue;
    }
    if (!entry.isFile()) continue;
    snapshot[`file:${relativePath}`] = createHash("sha256")
      .update(readFileSync(path))
      .digest("hex");
  }
}
