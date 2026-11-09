import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE =
  migrationGuide("mergeprops--splitprops--merge--omit");

export function analyzeMergeProps(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "mergeProps").map(
    ({ call, argumentNodes, filename }) => {
      const start = call.range().start;
      const spreadDetail = argumentNodes.some(
        (argument) => argument.kind() === "spread_element",
      )
        ? " At least one semantic argument uses spread syntax."
        : "";
      return finding(filename, start, {
        severity: "build",
        headline: `Migrate this mergeProps call to a reviewed merge.`,
        why: `Solid ${SOLID_TARGET_VERSION} replaces mergeProps with merge, but merge treats a property that exists on a later source with the value undefined as the winner instead of falling through to an earlier source. This call has ${argumentNodes.length} semantic argument(s).${spreadDetail}`,
        guidance: `Read every source in argument order, list all overlapping keys, and trace every consumer of the merged value. Replace mergeProps with merge from solid-js only after proving that every later overlapping value is non-undefined and that zero-argument behavior, one-source result identity, and mutation semantics do not matter. Stop without proposing a replacement when existing TypeScript types or the inferred Merge result type are the only runtime-safety evidence, a source is any/unknown/union-typed at runtime, a props or store proxy, a function, or has getters or dynamic key presence, source or result identity or mutation is observed, or a consumer depends on fallback-through-undefined behavior. If old undefined-fallback behavior is required, preserve live reactive reads with a targeted manual guard at the disputed property boundary rather than object spread or Object.assign. Ask for the smallest focused test or runtime observation that exposes the disputed property's value, precedence, identity, and mutation boundary.`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      });
    },
  );
}
