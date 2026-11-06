import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeCreateComputed } from "./create-computed.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#createcomputed--creatememo-createeffect-or-derived-createsignal";

const testCreateComputedRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const source = root.source();
  const guidance = analyzeCreateComputed(root.root(), {
    filename: "ignored-context-filename.tsx",
  });
  const sites: Array<[location: string, argumentCount: 1 | 2 | 3]> =
    source.includes('from "solid\\u{000002d}js"')
      ? [
          ["11:1", 1],
          ["12:1", 1],
          ["13:1", 1],
          ["14:1", 1],
          ["19:1", 1],
          ["20:1", 2],
          ["21:1", 3],
          ["27:1", 1],
          ["28:1", 1],
        ]
      : [];
  const expected = sites.map(
    ([location, argumentCount]) =>
      `${filename}:${location} Manual review required: choose a Solid 2 replacement for this createComputed call.
Why: Solid 2.0.0-rc.21 removes createComputed; the correct replacement depends on whether the callback derives a value, performs an effect, or encodes stateful update logic. This call has ${argumentCount} semantic argument(s).
Guidance: Read the complete callback, its consumers, nearby signal/store declarations, and ordering assumptions. Use createMemo only for a readonly derived value that consumers read. Use Solid 2's split createEffect when reactive reads can be isolated in the compute callback and imperative work belongs in the untracked effect callback. Use function-form createSignal, or derived createStore for object and array projections, only when writable derived state is intentional. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the callback uses its previous value or an initial/options argument, writes to a dependency or may form a cycle, mixes several operations, relies on immediate or render ordering, registers cleanup, starts async work, contains nested control flow or reactive primitive creation, or has unclear ownership or consumers. Ask for the smallest focused test or runtime observation that exposes the required value, timing, and write behavior. Ongoing check: after migration, eslint-plugin-solid's solid/removed-api rule (v2 config) reports this site. Official migration guide: ${MIGRATION_GUIDE}`,
  );

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected createComputed guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every createComputed finding must link the migration guide");
  }
  if (guidance.some((entry) => entry.includes("[S2-COMPUTED-001]"))) {
    throw new Error("createComputed guidance must not expose the old rule ID");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every createComputed finding must require manual review");
  }

  if (sites.length > 0) {
    const negativeEvidence = [
      ["zero arguments", "createComputed();"],
      [
        "four arguments",
        'createComputed(() => count(), 0, { name: "legacy" }, "extra");',
      ],
      ["spread arguments", "createComputed(...computedCallbacks);"],
      ["indirect call", "indirect(() => count());"],
      [
        "shadowed binding",
        "function shadowed(createComputed: (callback: () => number) => void)",
      ],
    ] as const;
    for (const [label, text] of negativeEvidence) {
      if (!source.includes(text)) {
        throw new Error(`fixture must prove the ${label} negative`);
      }
    }
  } else if (
    !source.includes('import { createComputed } from "other-library"') ||
    !source.includes("createComputed(() => 1);")
  ) {
    throw new Error("fixture must prove the non-Solid import negative");
  }

  return null;
};

export default testCreateComputedRule;
