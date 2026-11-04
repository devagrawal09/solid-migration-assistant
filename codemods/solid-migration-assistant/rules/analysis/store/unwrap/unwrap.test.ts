import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeUnwrap } from "./unwrap.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#unwrapstore--snapshotstore";

const testUnwrapRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeUnwrap(root.root(), {
    filename: "ignored-context-filename.tsx",
  });
  const locations = root.source().includes('from "solid-js\\u002fstore"')
    ? ["9:1", "10:1", "12:1", "19:1", "20:1"]
    : [];
  const expected = locations.map(
    (location) => `${filename}:${location} Manual review required: migrate this unwrap call to a reviewed snapshot.
Why: Solid 2.0.0-rc.21 replaces unwrap(store) with snapshot(store) for capturing a point-in-time, non-reactive snapshot of a Solid store, but replacement safety depends on the input, capture time, and every consumer.
Guidance: Read the complete input expression and prove it is a Solid store, then trace every consumer of the unwrap result. Replace unwrap with snapshot from solid-js only after proving that a point-in-time snapshot is intended, and preserve the exact surrounding evaluation point so capture timing and side effects do not move. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a replacement when the input's store provenance is unclear, the current value's object or nested identity is observed, the value is expected to remain live across store updates, the result or nested data is mutated, the result escapes or is passed to code with unknown ownership, or any consumer is unclear. Ask for the smallest focused test or runtime observation that exposes the disputed capture or consumer boundary at this site, such as the result before and after a store update, nested reads, identity, mutation, serialization, or ownership transfer. Official migration guide: ${MIGRATION_GUIDE}`,
  );

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected unwrap guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every unwrap finding must link the migration guide");
  }
  if (guidance.some((entry) => entry.includes("[S2-STORE-UNWRAP-001]"))) {
    throw new Error("unwrap guidance must not expose the old rule ID");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every unwrap finding must require manual review");
  }

  return null;
};

export default testUnwrapRule;
