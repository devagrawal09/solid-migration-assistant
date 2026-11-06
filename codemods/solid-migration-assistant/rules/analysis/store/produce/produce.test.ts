import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeProduce } from "./produce.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#produce--now-the-default-setter-behavior";

const testProduceRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeProduce(root.root(), {
    filename: "ignored-context-filename.tsx",
  });
  const locations = root.source().includes('from "solid-js/store"')
    ? ["8:1", "13:3", "20:1", "23:1", "24:23", "35:1", "36:1"]
    : [];
  const expected = locations.map(
    (location) => `${filename}:${location} Manual review required: migrate this produce wrapper to draft-first setter behavior.
Why: Solid 2.0.0-rc.21 store setters are draft-first and receive a mutable draft in their mutation callback, so a legacy produce wrapper is unnecessary only after the surrounding call is proven to use the intended store-setter overload.
Guidance: Read the immediate parent call, identify the exact store setter overload and any path arguments, and review the full mutation callback. Pass the callback directly to the setter only after proving that this wrapper supplies that setter's mutation callback. For nested produce calls, review each wrapper, its containing call, and its full callback independently. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing wrapper removal when the result is stored, returned, composed, passed through another function, used with a non-store setter, or when callback returns, nested control flow, async work, external mutation, or target ownership make draft behavior unclear. Ask for the smallest focused test or runtime observation that exposes the selected setter overload and resulting store update. Ongoing check: after migration, eslint-plugin-solid's solid/removed-api rule (v2 config) reports this site. Official migration guide: ${MIGRATION_GUIDE}`,
  );

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected produce guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every produce finding must link the migration guide");
  }
  if (guidance.some((entry) => entry.includes("[S2-STORE-PRODUCE-001]"))) {
    throw new Error("produce guidance must not expose the old rule ID");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every produce finding must require manual review");
  }

  return null;
};

export default testProduceRule;
