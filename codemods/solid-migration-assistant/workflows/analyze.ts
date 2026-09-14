/**
 * The read-only `analyze` workflow. Each of the 37 named analyzers is its own
 * inline JSSG definition and its own command over the whole target, exactly
 * as the former YAML workflow ran each rule as a separate workspace-semantic
 * step: every command indexes the complete selected file set, so a rule's
 * cross-file `references()` lookups see every project file. A transform
 * returns each file's guidance as structured output and never an edit; the
 * final workflow stage flattens, deduplicates, and sorts the strings and
 * returns them as data for the launcher to print.
 *
 * The analyzers read the target and share nothing, so they are declared as
 * one `parallel()` group rather than awaited one at a time. The group states
 * only that the commands may overlap; the engine's admission scheduler owns
 * how many actually run at once, weighting a workspace-semantic JSSG batch
 * heaviest. Nothing here chunks the group or asks for a concurrency level.
 * `parallel()` resolves to one output per member in declaration order
 * regardless of completion order, so the aggregated report is unchanged.
 *
 * A transform may only use its parameters and imported bindings, so each one
 * delegates to the bundled `analyzeFile` adapter with the rule it imports.
 */
import { jssg, parallel, sequence, workflow } from "@codemod.com/orchestration";
import { analyzeBeta32SubpathImports } from "../rules/analysis/imports/beta32-subpaths/beta32-subpaths.ts";
import { analyzeWebImport } from "../rules/analysis/imports/web-import/web-import.ts";
import { analyzeJsxClassListAttributes } from "../rules/analysis/jsx/class-list/class-list.ts";
import { analyzeJsxComponentRenames } from "../rules/analysis/jsx/component-renames/component-renames.ts";
import { analyzeContextProvider } from "../rules/analysis/jsx/context-provider/context-provider.ts";
import { analyzeDomAttrNamespaces } from "../rules/analysis/jsx/dom-attr-namespaces/dom-attr-namespaces.ts";
import { analyzeDomEventNamespaces } from "../rules/analysis/jsx/dom-event-namespaces/dom-event-namespaces.ts";
import { analyzeDomUseDirective } from "../rules/analysis/jsx/dom-use-directive/dom-use-directive.ts";
import { analyzeOnCleanup } from "../rules/analysis/lifecycle/on-cleanup/on-cleanup.ts";
import { analyzeOnMount } from "../rules/analysis/lifecycle/on-mount/on-mount.ts";
import { analyzeMergeProps } from "../rules/analysis/props/merge-props/merge-props.ts";
import { analyzeSplitProps } from "../rules/analysis/props/split-props/split-props.ts";
import { analyzeBatch } from "../rules/analysis/reactivity/batch/batch.ts";
import { analyzeCreateComputed } from "../rules/analysis/reactivity/create-computed/create-computed.ts";
import { analyzeCreateDynamic } from "../rules/analysis/reactivity/create-dynamic/create-dynamic.ts";
import { analyzeCreateEffect } from "../rules/analysis/reactivity/create-effect/create-effect.ts";
import { analyzeCreateMemo } from "../rules/analysis/reactivity/create-memo/create-memo.ts";
import { analyzeCreateResource } from "../rules/analysis/reactivity/create-resource/create-resource.ts";
import { analyzeCreateSelector } from "../rules/analysis/reactivity/create-selector/create-selector.ts";
import {
  analyzeCatchError,
  analyzeOnError,
  analyzeResetErrorBoundaries,
} from "../rules/analysis/reactivity/error-handling/error-handling.ts";
import {
  analyzeFrom,
  analyzeObservable,
} from "../rules/analysis/reactivity/from-observable/from-observable.ts";
import { analyzeIndexArray } from "../rules/analysis/reactivity/index-array/index-array.ts";
import { analyzeOnHelper } from "../rules/analysis/reactivity/on-helper/on-helper.ts";
import {
  analyzeCreateDeferred,
  analyzeStartTransition,
  analyzeUseTransition,
} from "../rules/analysis/reactivity/transition-apis/transition-apis.ts";
import {
  analyzeEnableScheduling,
  analyzeEqualFn,
  analyzeGetListener,
  analyzeWriteSignal,
} from "../rules/analysis/reactivity/utility-renames/utility-renames.ts";
import {
  analyzeCreateMutable,
  analyzeModifyMutable,
} from "../rules/analysis/store/mutable/mutable.ts";
import { analyzeProduce } from "../rules/analysis/store/produce/produce.ts";
import { analyzeUnwrap } from "../rules/analysis/store/unwrap/unwrap.ts";
import { analyzeFile } from "../shared/entrypoint.ts";
import {
  aggregateReport,
  FileStrings,
  SOURCE_EXCLUDE,
  SOURCE_INCLUDE,
} from "../shared/workflow.ts";

const beta32SubpathImports = jssg({
  name: "analyzeBeta32SubpathImports",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeBeta32SubpathImports, root),
});

const webImport = jssg({
  name: "analyzeWebImport",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeWebImport, root),
});

const jsxClassListAttributes = jssg({
  name: "analyzeJsxClassListAttributes",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeJsxClassListAttributes, root),
});

const jsxComponentRenames = jssg({
  name: "analyzeJsxComponentRenames",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeJsxComponentRenames, root),
});

const contextProvider = jssg({
  name: "analyzeContextProvider",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeContextProvider, root),
});

const domAttrNamespaces = jssg({
  name: "analyzeDomAttrNamespaces",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeDomAttrNamespaces, root),
});

const domEventNamespaces = jssg({
  name: "analyzeDomEventNamespaces",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeDomEventNamespaces, root),
});

const domUseDirective = jssg({
  name: "analyzeDomUseDirective",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeDomUseDirective, root),
});

const onCleanup = jssg({
  name: "analyzeOnCleanup",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeOnCleanup, root),
});

const onMount = jssg({
  name: "analyzeOnMount",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeOnMount, root),
});

const mergeProps = jssg({
  name: "analyzeMergeProps",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeMergeProps, root),
});

const splitProps = jssg({
  name: "analyzeSplitProps",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeSplitProps, root),
});

const batch = jssg({
  name: "analyzeBatch",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeBatch, root),
});

const createComputed = jssg({
  name: "analyzeCreateComputed",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeCreateComputed, root),
});

const createDynamic = jssg({
  name: "analyzeCreateDynamic",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeCreateDynamic, root),
});

const createEffect = jssg({
  name: "analyzeCreateEffect",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeCreateEffect, root),
});

const createMemo = jssg({
  name: "analyzeCreateMemo",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeCreateMemo, root),
});

const createResource = jssg({
  name: "analyzeCreateResource",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeCreateResource, root),
});

const createSelector = jssg({
  name: "analyzeCreateSelector",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeCreateSelector, root),
});

const onError = jssg({
  name: "analyzeOnError",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeOnError, root),
});

const catchError = jssg({
  name: "analyzeCatchError",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeCatchError, root),
});

const resetErrorBoundaries = jssg({
  name: "analyzeResetErrorBoundaries",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeResetErrorBoundaries, root),
});

const from = jssg({
  name: "analyzeFrom",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeFrom, root),
});

const observable = jssg({
  name: "analyzeObservable",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeObservable, root),
});

const indexArray = jssg({
  name: "analyzeIndexArray",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeIndexArray, root),
});

const onHelper = jssg({
  name: "analyzeOnHelper",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeOnHelper, root),
});

const startTransition = jssg({
  name: "analyzeStartTransition",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeStartTransition, root),
});

const useTransition = jssg({
  name: "analyzeUseTransition",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeUseTransition, root),
});

const createDeferred = jssg({
  name: "analyzeCreateDeferred",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeCreateDeferred, root),
});

const equalFn = jssg({
  name: "analyzeEqualFn",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeEqualFn, root),
});

const getListener = jssg({
  name: "analyzeGetListener",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeGetListener, root),
});

const writeSignal = jssg({
  name: "analyzeWriteSignal",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeWriteSignal, root),
});

const enableScheduling = jssg({
  name: "analyzeEnableScheduling",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeEnableScheduling, root),
});

const createMutable = jssg({
  name: "analyzeCreateMutable",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeCreateMutable, root),
});

const modifyMutable = jssg({
  name: "analyzeModifyMutable",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeModifyMutable, root),
});

const produce = jssg({
  name: "analyzeProduce",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeProduce, root),
});

const unwrap = jssg({
  name: "analyzeUnwrap",
  language: "tsx",
  include: SOURCE_INCLUDE,
  exclude: SOURCE_EXCLUDE,
  semanticAnalysis: "workspace",
  output: FileStrings,
  transform: (root) => analyzeFile(analyzeUnwrap, root),
});

/** Every analyzer, in the order the former YAML workflow declared its steps. */
export const analyzers = [
  beta32SubpathImports,
  webImport,
  jsxClassListAttributes,
  jsxComponentRenames,
  contextProvider,
  domAttrNamespaces,
  domEventNamespaces,
  domUseDirective,
  onCleanup,
  onMount,
  mergeProps,
  splitProps,
  batch,
  createComputed,
  createDynamic,
  createEffect,
  createMemo,
  createResource,
  createSelector,
  onError,
  catchError,
  resetErrorBoundaries,
  from,
  observable,
  indexArray,
  onHelper,
  startTransition,
  useTransition,
  createDeferred,
  equalFn,
  getListener,
  writeSignal,
  enableScheduling,
  createMutable,
  modifyMutable,
  produce,
  unwrap,
];

export default sequence(parallel(analyzers), workflow(aggregateReport));
