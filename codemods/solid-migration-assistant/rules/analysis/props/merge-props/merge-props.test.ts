import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeMergeProps } from "./merge-props.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#mergeprops--splitprops--merge--omit";

const testMergePropsRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeMergeProps(root.root(), {
    filename: "ignored-context-filename.tsx",
  });
  const sites: Array<
    [location: string, argumentCount: number, hasSpread: boolean]
  > = root.source().includes("/* before */ mergeProps /* after */")
    ? [
        ["10:1", 2, false],
        ["11:1", 2, false],
        ["13:1", 1, true],
        ["15:1", 2, false],
        ["17:1", 2, false],
        ["18:1", 2, false],
      ]
    : [];
  const expected = sites.map(([location, argumentCount, hasSpread]) => {
    const spreadDetail = hasSpread
      ? " At least one semantic argument uses spread syntax."
      : "";
    return `${filename}:${location} Manual review required: migrate this mergeProps call to a reviewed merge.
Why: Solid 2.0.0-rc.21 replaces mergeProps with merge, but merge treats a property that exists on a later source with the value undefined as the winner instead of falling through to an earlier source. This call has ${argumentCount} semantic argument(s).${spreadDetail}
Guidance: Read every source in argument order, list all overlapping keys, and trace every consumer of the merged value. Replace mergeProps with merge from solid-js only after proving that every later overlapping value is non-undefined and that zero-argument behavior, one-source result identity, and mutation semantics do not matter. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a replacement when existing TypeScript types or the inferred Merge result type are the only runtime-safety evidence, a source is any/unknown/union-typed at runtime, a props or store proxy, a function, or has getters or dynamic key presence, source or result identity or mutation is observed, or a consumer depends on fallback-through-undefined behavior. If old undefined-fallback behavior is required, preserve live reactive reads with a targeted manual guard at the disputed property boundary rather than object spread or Object.assign. Ask for the smallest focused test or runtime observation that exposes the disputed property's value, precedence, identity, and mutation boundary. Official migration guide: ${MIGRATION_GUIDE}`;
  });

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected mergeProps guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every mergeProps finding must link the migration guide");
  }
  if (guidance.some((entry) => entry.includes("[S2-PROPS-001]"))) {
    throw new Error("mergeProps guidance must not expose the old rule ID");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every mergeProps finding must require manual review");
  }

  return null;
};

export default testMergePropsRule;
