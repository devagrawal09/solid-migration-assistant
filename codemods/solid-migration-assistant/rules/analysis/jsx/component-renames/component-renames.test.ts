import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeJsxComponentRenames } from "./component-renames.ts";

const SUSPENSE_BOUNDARY_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#suspense--errorboundary--loading--errored";
const INDEX_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#list-rendering-index-is-gone-and-for-handles-each-keying-mode";
const SUSPENSE_LIST_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#coordinating-loading-boundaries-suspenselist--reveal";

const testJsxComponentRenames: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeJsxComponentRenames(root.root(), {
    filename: "ignored-context-filename.tsx",
  });
  const expected = [
    `${filename}:18:7 Manual review required: migrate this imported Suspense JSX site to Loading.
Why: Solid 2 replaces the solid-js Suspense component with Loading for initial not-ready fallback UI.
Guidance: Read this complete boundary, its fallback, children, props, and corresponding import. Replace the unaliased named Suspense import and this JSX component with Loading only after confirming that the boundary owns initial not-ready UI and that its fallback and children preserve their rendering behavior. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when props are spread or forwarded, fallback ownership or evaluation is indirect, nested async boundaries make the intended initial-loading behavior unclear, or focused rendering tests do not cover the fallback and ready states. Ask for the smallest focused test or runtime observation that exposes both states. Official migration guide: ${SUSPENSE_BOUNDARY_GUIDE}`,
    `${filename}:20:9 Manual review required: migrate this imported ErrorBoundary JSX site to Errored.
Why: Solid 2 replaces the solid-js ErrorBoundary component with Errored, whose fallback receives an error accessor rather than a raw error value.
Guidance: Read this complete boundary, its fallback, children, props, and corresponding import. Replace the unaliased named ErrorBoundary import and this JSX component with Errored only after updating every fallback use to read the error accessor, such as err(), while preserving error ownership and recovery behavior. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when props are spread or forwarded, the fallback is indirect or escapes, the error value is passed to unknown code, reset or recovery behavior is unclear, or focused tests do not cover thrown and recovered states. Ask for the smallest focused test or runtime observation that exposes the fallback value and recovery behavior. Official migration guide: ${SUSPENSE_BOUNDARY_GUIDE}`,
    `${filename}:25:7 Manual review required: migrate this imported Suspense JSX site to Loading.
Why: Solid 2 replaces the solid-js Suspense component with Loading for initial not-ready fallback UI.
Guidance: Read this complete boundary, its fallback, children, props, and corresponding import. Replace the unaliased named Suspense import and this JSX component with Loading only after confirming that the boundary owns initial not-ready UI and that its fallback and children preserve their rendering behavior. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when props are spread or forwarded, fallback ownership or evaluation is indirect, nested async boundaries make the intended initial-loading behavior unclear, or focused rendering tests do not cover the fallback and ready states. Ask for the smallest focused test or runtime observation that exposes both states. Official migration guide: ${SUSPENSE_BOUNDARY_GUIDE}`,
    `${filename}:27:7 Manual review required: migrate this imported SuspenseList JSX site to Reveal.
Why: Solid 2 replaces SuspenseList with Reveal for coordinating sibling Loading boundaries and replaces revealOrder and tail controls with order and collapsed semantics.
Guidance: Read the complete group, its revealOrder and tail values, children, nesting, props, and corresponding import. Replace the unaliased named SuspenseList import and this JSX component with Reveal only after mapping literal revealOrder="forwards" to the default or order="sequential", revealOrder="together" to order="together", and tail="collapsed" to collapsed only under sequential order; review the children as sibling Loading boundaries, and do not use the earlier-beta boolean together prop. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when props are spread or forwarded, revealOrder or tail is dynamic or has another value, child boundary ownership or nesting is unclear, intended reveal timing cannot be established, or focused behavior tests do not cover the coordinated states. Ask for the smallest focused test or runtime observation that exposes ordering, fallback, and collapsed-tail behavior. Official migration guide: ${SUSPENSE_LIST_GUIDE}`,
    `${filename}:28:9 Manual review required: migrate this imported Suspense JSX site to Loading.
Why: Solid 2 replaces the solid-js Suspense component with Loading for initial not-ready fallback UI.
Guidance: Read this complete boundary, its fallback, children, props, and corresponding import. Replace the unaliased named Suspense import and this JSX component with Loading only after confirming that the boundary owns initial not-ready UI and that its fallback and children preserve their rendering behavior. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when props are spread or forwarded, fallback ownership or evaluation is indirect, nested async boundaries make the intended initial-loading behavior unclear, or focused rendering tests do not cover the fallback and ready states. Ask for the smallest focused test or runtime observation that exposes both states. Official migration guide: ${SUSPENSE_BOUNDARY_GUIDE}`,
    `${filename}:33:7 Manual review required: migrate this imported Index JSX site to For keyed={false}.
Why: Solid 2 removes Index; its direct replacement is For with keyed={false}, whose child callback receives an item accessor and a stable numeric index.
Guidance: Read the complete list site, its each value, child callback, props, and corresponding import. Replace the unaliased named Index import and this JSX component with For, add the literal keyed={false} mode, and review the callback so the item remains an accessor and the index remains a stable number. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when props are spread or forwarded, each or the child callback is indirect, callback parameters escape to unknown code, item identity or index behavior is unclear, or focused list-update tests do not prove state preservation. Ask for the smallest focused test or runtime observation that covers insertion, removal, reordering, and item updates. Official migration guide: ${INDEX_GUIDE}`,
  ];

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected JSX component guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
  if (guidance.some((entry) => entry.includes("[S2-JSX-COMPONENT-001]"))) {
    throw new Error("JSX component guidance must not expose the old rule ID");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every JSX component finding must require manual review");
  }

  return null;
};

export default testJsxComponentRenames;
