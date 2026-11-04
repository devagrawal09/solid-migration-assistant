import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeOnMount } from "./on-mount.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup";

const testOnMountRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeOnMount(root.root(), {
    filename: "ignored-context-filename.tsx",
  });
  const locations = root.source().includes('from "solid-js"')
    ? ["9:1", "14:1", "18:1", "24:1", "29:1", "30:1", "32:1", "34:1", "35:1"]
    : [];
  const expected = locations.map(
    (location) => `${filename}:${location} Manual review required: migrate this onMount lifecycle callback.
Why: Solid 2 removes onMount; onSettled is its closest replacement and can return an owner-bound cleanup function, but the correct migration depends on the callback's ownership, required timing, and cleanup behavior.
Guidance: Read the complete callback, its owner, and nearby cleanup registration. Establish who owns the work, when it must run relative to rendering and settling, and what must be disposed. Move the work to onSettled only after proving that timing is compatible, and return owner-bound cleanup from the onSettled callback. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the callback registers cleanup, starts async work, contains nested control flow that changes lifecycle behavior, creates reactive primitives, or has unclear ownership. Ask for the smallest focused test or runtime observation that makes the required timing and cleanup behavior observable. Official migration guide: ${MIGRATION_GUIDE}`,
  );

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected onMount guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every onMount finding must link the migration guide");
  }
  if (guidance.some((entry) => entry.includes("[S2-LIFECYCLE-001]"))) {
    throw new Error("onMount guidance must not expose the old rule ID");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every onMount finding must require manual review");
  }

  return null;
};

export default testOnMountRule;
