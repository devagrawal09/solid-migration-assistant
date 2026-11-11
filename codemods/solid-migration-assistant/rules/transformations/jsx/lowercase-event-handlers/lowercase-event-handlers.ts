import type { Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import {
  collectJsxAttributes,
  compareStart,
  hasSingleExpressionValue,
  isIntrinsicElementName,
  type JsxAttribute,
} from "../../../../shared/jsx.ts";
import { MIGRATION_GUIDE_URL, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { rewrite, type RuleRewrite } from "../../../../shared/finding.ts";

export { SOLID_SOURCE_COMMIT } from "../../../../shared/target.ts";

export const EVENT_HANDLER_MIGRATION_GUIDE = `${MIGRATION_GUIDE_URL}#attributes--events-closer-to-html-and-fewer-namespaces`;

/**
 * Every camelCase event handler attribute declared by the Solid ${SOLID_TARGET_VERSION}
 * web JSX types (`packages/web/jsx/jsx.d.ts` at the pinned commit: the
 * `EventHandlersElement` and `EventHandlersWindow` interfaces). The rewrite
 * targets only these spellings, so a renamed attribute is both the runtime
 * event form and the typed one. Lowercasing each entry gives the Solid 1.x
 * spelling it replaces; no two entries share a lowercase form.
 */
export const CAMEL_CASE_EVENT_HANDLERS: readonly string[] = [
  "onAbort", "onAfterPrint", "onAnimationCancel", "onAnimationEnd",
  "onAnimationIteration", "onAnimationStart", "onAuxClick", "onBeforeCopy",
  "onBeforeCut", "onBeforeInput", "onBeforeMatch", "onBeforePaste",
  "onBeforePrint", "onBeforeToggle", "onBeforeUnload", "onBeforeXRSelect",
  "onBegin", "onBlur", "onCanPlay", "onCanPlayThrough", "onCancel",
  "onChange", "onClick", "onClose", "onCommand", "onCompositionEnd",
  "onCompositionStart", "onCompositionUpdate",
  "onContentVisibilityAutoStateChange", "onContextLost", "onContextMenu",
  "onContextRestored", "onCopy", "onCueChange", "onCut", "onDblClick",
  "onDeviceMotion", "onDeviceOrientation", "onDeviceOrientationAbsolute",
  "onDrag", "onDragEnd", "onDragEnter", "onDragExit", "onDragLeave",
  "onDragOver", "onDragStart", "onDrop", "onDurationChange", "onEmptied",
  "onEncrypted", "onEnd", "onEnded", "onEnterPictureInPicture", "onError",
  "onFocus", "onFocusIn", "onFocusOut", "onFormData", "onFullscreenChange",
  "onFullscreenError", "onGamepadConnected", "onGamepadDisconnected",
  "onGotPointerCapture", "onHashchange", "onInput", "onInvalid", "onKeyDown",
  "onKeyPress", "onKeyUp", "onLanguageChange", "onLeavePictureInPicture",
  "onLoad", "onLoadStart", "onLoadedData", "onLoadedMetadata",
  "onLostPointerCapture", "onMessage", "onMessageError", "onMouseDown",
  "onMouseEnter", "onMouseLeave", "onMouseMove", "onMouseOut", "onMouseOver",
  "onMouseUp", "onOffline", "onOnline", "onOrientationChange", "onPageHide",
  "onPageReveal", "onPageShow", "onPageSwap", "onPaste", "onPause", "onPlay",
  "onPlaying", "onPointerCancel", "onPointerDown", "onPointerEnter",
  "onPointerLeave", "onPointerMove", "onPointerOut", "onPointerOver",
  "onPointerRawUpdate", "onPointerUp", "onPopstate", "onProgress",
  "onRateChange", "onRejectionHandled", "onRepeat", "onReset", "onResize",
  "onScroll", "onScrollEnd", "onScrollSnapChange", "onScrollSnapChanging",
  "onSecurityPolicyViolation", "onSeeked", "onSeeking", "onSelect",
  "onSelectStart", "onSelectionChange", "onSlotChange", "onStalled",
  "onStorage", "onSubmit", "onSuspend", "onTimeUpdate", "onToggle",
  "onTouchCancel", "onTouchEnd", "onTouchMove", "onTouchStart",
  "onTransitionCancel", "onTransitionEnd", "onTransitionRun",
  "onTransitionStart", "onUnhandledRejection", "onUnload", "onVolumeChange",
  "onWaiting", "onWaitingForKey", "onWheel",];

const CAMEL_CASE_BY_LOWERCASE: ReadonlyMap<string, string> = new Map(
  CAMEL_CASE_EVENT_HANDLERS.map((name) => [name.toLowerCase(), name]),
);

export type EventHandlerRewrite = {
  edit: Edit;
  report: RuleRewrite;
};

/**
 * The automatic subset of the Solid 2 lowercase event-attribute change.
 *
 * Solid 1.x treated every `on`-prefixed prop on a native element as an event
 * handler regardless of case: the compiler's `toEventName` and the runtime's
 * `assignProp` (`babel-plugin-jsx-dom-expressions@0.40.7` and
 * `dom-expressions@0.40.8`, the versions pinned by `solid-js@1.9.13`) both
 * derive the event name as `prop.slice(2).toLowerCase()`, and the SSR
 * renderer skips every prop whose first two characters are `on`. So
 * `<button onclick={fn}>` and `<button onClick={fn}>` compiled, bound,
 * delegated, and server-rendered identically, and the 1.x JSX types declared
 * both spellings.
 *
 * Solid ${SOLID_TARGET_VERSION} narrows that rule to `on` followed by an uppercase
 * letter (`packages/web/src/client.ts`, `assignProp`); a lowercase `on*`
 * name is a plain attribute in the browser, in SSR output, and through
 * spreads, so `onclick={fn}` now stringifies the function into an `onclick`
 * attribute and binds nothing (in development it warns with
 * `LOWERCASE_EVENT_ATTRIBUTE`). The migration guide's DOM section prescribes
 * exactly one rewrite: `<button onclick={increment} />` becomes
 * `<button onClick={increment} />`.
 *
 * Because both spellings were the same handler in 1.x and only the camelCase
 * one is a handler in 2.0, renaming the attribute is an equivalence when
 * nothing else on the element can bind the same event. This rule rewrites an
 * attribute only when all of the following hold:
 *
 * - the element is intrinsic (a plain lowercase-initial element name,
 *   including custom elements), never a component or a namespaced name, since
 *   a component receives `onclick` as an ordinary prop;
 * - the attribute name is a plain `on` + lowercase name whose camelCase form
 *   is declared by the pinned Solid 2 JSX types;
 * - the value is an expression container holding exactly one expression (a
 *   string value is the HTML inline-handler attribute in 2.0 and is left for
 *   review);
 * - no other attribute on the element targets the same event: no other
 *   `on*` spelling of it (`onclick` beside `onClick`, or twice), and no
 *   `on:` or `oncapture:` namespaced form of it; and
 * - the element carries no spread attribute, since a spread can supply the
 *   camelCase handler and the merge order would decide which one wins.
 *
 * Only the attribute's name node changes; the value expression, its comments,
 * whitespace, and every other attribute stay byte-identical. Everything else,
 * including custom event names (`onmycustomevent`) and the removed `on:` and
 * `oncapture:` namespaces, is left to the read-only analyzers.
 */
export function rewriteLowercaseEventHandlers(
  rootNode: SgNode<TSX>,
  filename: string,
): EventHandlerRewrite[] {
  const rewrites: { node: SgNode<TSX>; entry: EventHandlerRewrite }[] = [];

  for (const elementKind of [
    "jsx_opening_element",
    "jsx_self_closing_element",
  ] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      rewrites.push(...rewriteElement(element, filename));
    }
  }

  return rewrites
    .sort((left, right) => compareStart(left.node, right.node))
    .map(({ entry }) => entry);
}

function rewriteElement(
  element: SgNode<TSX>,
  filename: string,
): { node: SgNode<TSX>; entry: EventHandlerRewrite }[] {
  const elementName = element.field("name");
  if (!isIntrinsicElementName(elementName)) return [];

  const attributes = collectJsxAttributes(element);
  if (attributes === null) return [];

  const eventCounts = new Map<string, number>();
  for (const attribute of attributes) {
    const event = targetedEvent(attribute);
    if (event !== null) eventCounts.set(event, (eventCounts.get(event) ?? 0) + 1);
  }

  const entries: { node: SgNode<TSX>; entry: EventHandlerRewrite }[] = [];
  for (const attribute of attributes) {
    const camelCase = lowercaseHandlerReplacement(attribute);
    if (camelCase === null) continue;
    if ((eventCounts.get(camelCase.slice(2).toLowerCase()) ?? 0) !== 1) continue;
    if (!hasSingleExpressionValue(attribute.node)) continue;

    const start = attribute.name.range().start;
    entries.push({
      node: attribute.name,
      entry: {
        edit: attribute.name.replace(camelCase),
        report: rewrite(filename, start, `Rewrite the ${attribute.name.text()} event handler attribute on <${elementName.text()}> to ${camelCase}, preserving its value expression.`, EVENT_HANDLER_MIGRATION_GUIDE),
      },
    });
  }
  return entries;
}

/**
 * The camelCase replacement for a plainly named lowercase `on*` attribute
 * whose camelCase form the pinned Solid 2 JSX types declare, else null.
 */
function lowercaseHandlerReplacement(attribute: JsxAttribute): string | null {
  if (attribute.name.kind() !== "property_identifier") return null;
  const text = attribute.name.text();
  if (!/^on[a-z]+$/.test(text)) return null;
  return CAMEL_CASE_BY_LOWERCASE.get(text) ?? null;
}

/**
 * The lowercase DOM event an attribute binds in Solid 1.x, if any: any
 * `on`-prefixed plain name (`onclick`, `onClick`), or the local part of an
 * `on:` / `oncapture:` namespaced name. Used to refuse elements where two
 * attributes target one event.
 */
function targetedEvent(attribute: JsxAttribute): string | null {
  const text = attribute.name.text();
  if (attribute.name.kind() === "property_identifier") {
    return /^on[A-Za-z]+$/.test(text) ? text.slice(2).toLowerCase() : null;
  }
  const match = /^(?:on|oncapture):(.+)$/.exec(text);
  return match ? match[1]!.toLowerCase() : null;
}
