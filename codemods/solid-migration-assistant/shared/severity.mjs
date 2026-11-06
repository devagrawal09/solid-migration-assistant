/**
 * Severity tiers for analyzer findings, shared by the in-workflow summary
 * (`scripts/emit-report.ts`) and the launcher's JSON output
 * (`shared/run-workflow.mjs`). Each tier is grounded in the pinned Solid 2 RC:
 *
 * - `build`: the code will not build or run on Solid 2 as written. The
 *   import path or export no longer exists, the compiler rejects the syntax,
 *   or the call no longer matches the RC signature (for example a
 *   one-argument `createEffect`, whose apply callback is now required, or a
 *   path-style store setter, whose setter now accepts only a draft callback).
 * - `behavior`: the code still compiles but behaves differently, with no
 *   error to point at it (a lowercase `onclick` becomes a plain attribute,
 *   `onCleanup` inside a ref callback no longer runs, a nested `createRoot`
 *   is now disposed with its parent, `from` returns an async iterable).
 * - `deprecated`: the code keeps working without a runtime warning but the
 *   RC discourages it (`<Dynamic>`).
 *
 * Fix `build` findings first: until they are gone the project cannot run, so
 * `behavior` findings cannot be observed. The patterns match the headline,
 * the first line of a finding after its `file:line:column` location. An
 * unmatched headline falls back to `behavior`, the conservative tier, and the
 * architecture test fails until every headline the analyzers can emit is
 * listed here explicitly.
 */
export const SEVERITY_TIERS = Object.freeze([
  Object.freeze({ id: "build", label: "Will not build or run on Solid 2" }),
  Object.freeze({ id: "behavior", label: "Builds but behaves differently" }),
  Object.freeze({ id: "deprecated", label: "Deprecated but still working" }),
]);

const BUILD = [
  /^Move this Solid web renderer /,
  /^Move this Solid 2 legacy subpath /,
  /^Manual review required: move this (?:JSX|JSXElement) type import off solid-js\.$/,
  /^Manual review required: point this @jsxImportSource pragma at the renderer package\.$/,
  /^Manual review required: point jsxImportSource at the Solid 2 renderer package\.$/,
  /^Manual review required: move this project's Solid dependencies to /,
  /^Manual review required: migrate this intrinsic JSX classList attribute to class\.$/,
  /^Manual review required: migrate this (?:attr|bool): namespace attribute /,
  /^Manual review required: migrate this (?:on|oncapture):event namespace attribute /,
  /^Manual review required: migrate this use: directive to a ref directive factory\.$/,
  /^Manual review required: migrate this Context\.Provider JSX site /,
  /^Manual review required: migrate this imported (?:Suspense|ErrorBoundary|SuspenseList|Index) JSX site /,
  /^Manual review required: choose a Solid 2 replacement for this createComputed call\.$/,
  /^Manual review required: migrate this batch call /,
  /^Manual review required: migrate this createResource call /,
  /^Manual review required: migrate this \.(?:loading|error) access\.$/,
  /^Manual review required: migrate this \.(?:refetch|mutate)\(\) call\.$/,
  /^Manual review required: migrate this createSelector call /,
  /^Manual review required: migrate this createMutable call /,
  /^Manual review required: migrate this modifyMutable call /,
  /^Manual review required: migrate this produce wrapper /,
  /^Manual review required: migrate this mergeProps call /,
  /^Manual review required: migrate this splitProps tuple /,
  /^Manual review required: migrate this unwrap call /,
  /^Manual review required: migrate this onMount lifecycle callback\.$/,
  /^Manual review required: migrate this on tracking wrapper /,
  /^Manual review required: migrate this (?:onError|catchError) callback /,
  /^Manual review required: remove this resetErrorBoundaries call\.$/,
  /^Manual review required: migrate this (?:startTransition|useTransition) call /,
  /^Manual review required: migrate this indexArray call /,
  /^Manual review required: migrate this observable call /,
  /^Manual review required: migrate this createDynamic call /,
  /^Manual review required: migrate this (?:equalFn|getListener) reference /,
  /^Manual review required: remove this (?:writeSignal|enableScheduling) call\.$/,
  /^Manual review required: split this one-argument createEffect /,
  /^Manual review required: restructure this one-argument createEffect /,
  /^Manual review required: migrate this (?:zero|two|three)-argument createEffect call\.$/,
  /^Manual review required: rewrite this path-style store setter call /,
  /^Manual review required: rewrite this object-merge store setter call /,
];

const BEHAVIOR = [
  /^Manual review required: migrate this lowercase on[a-z]+ attribute to a camelCase event handler\.$/,
  /^Manual review required: move this onCleanup out of /,
  /^Manual review required: move owner-dependent work out of this ref callback\.$/,
  /^Manual review required: decide this nested createRoot's lifetime\.$/,
  /^Manual review required: migrate this createMemo initial value\.$/,
  /^Manual review required: migrate this from call /,
  /^Manual review required: review this createDeferred call /,
  /^Manual review required: review the value this store setter callback returns\.$/,
  /^Manual review required: trace this store setter that is passed as a value\.$/,
];

const DEPRECATED = [
  /^Manual review required: replace this deprecated Dynamic element /,
];

const TABLE = [
  ["build", BUILD],
  ["behavior", BEHAVIOR],
  ["deprecated", DEPRECATED],
];

/** The tier id for a headline, or null when no pattern lists it. */
export function explicitSeverity(headline) {
  for (const [id, patterns] of TABLE) {
    if (patterns.some((pattern) => pattern.test(headline))) return id;
  }
  return null;
}

/** The tier id for a headline; unlisted headlines fall back to `behavior`. */
export function severityOf(headline) {
  return explicitSeverity(headline) ?? "behavior";
}
