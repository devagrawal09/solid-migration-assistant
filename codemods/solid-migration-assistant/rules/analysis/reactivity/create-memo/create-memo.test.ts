import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeCreateMemo } from "./create-memo.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup";

const testCreateMemoRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeCreateMemo(root.root(), { filename });
  const sites: Array<[location: string, argumentCount: 2 | 3]> = root.source()
    .includes('from "solid-js"')
    ? [
        ["6:1", 2],
        ["7:1", 3],
        ["8:1", 2],
        ["9:1", 2],
        ["11:1", 3],
        ["17:1", 2],
        ["18:1", 2],
      ]
    : [];
  const expected = sites.map(([location, argumentCount]) => {
    const legacyOptions =
      argumentCount === 3 ? " and its third argument as options" : "";
    return `${filename}:${location} Manual review required: migrate this createMemo initial value.
Why: Solid 1.x treats this call's second argument as its initial value${legacyOptions}, while Solid 2.0.0-rc.21 treats the second argument as options and has no initial-value argument.
Guidance: Read the complete callback, the initial-value expression, its consumers, and nearby reactive state. Establish what the callback must receive on its first run and how later updates use the previous value. Preserve that behavior explicitly in surrounding state or callback logic before removing the legacy initial-value argument. For a three-argument call, review the legacy options separately and move only options supported by Solid 2.0.0-rc.21 into the second-argument position; for a two-argument call, do not reinterpret an option-shaped initial value as options. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when first-run or previous-value behavior is unclear, the initial-value expression has meaningful evaluation timing or side effects, options are dynamic or their compatibility is unknown, the callback writes to its inputs or may form a cycle, or ownership and consumers are unclear. Ask for the smallest focused test or runtime observation that exposes the first computed value and subsequent updates. Official migration guide: ${MIGRATION_GUIDE}`;
  });

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected createMemo guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every createMemo finding must link the migration guide");
  }
  if (guidance.some((entry) => entry.includes("[S2-MEMO-001]"))) {
    throw new Error("createMemo guidance must not expose the old rule ID");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every createMemo finding must require manual review");
  }

  return null;
};

export default testCreateMemoRule;
