import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeSplitProps } from "./split-props.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#mergeprops--splitprops--merge--omit";

const testSplitPropsRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeSplitProps(root.root(), {
    filename: "ignored-context-filename.tsx",
  });
  const sites: Array<[location: string, keyGroupCount: number]> = root
    .source()
    .includes('from "solid\\x2djs"')
    ? [
        ["9:23", 1],
        ["10:16", 2],
        ["12:1", 1],
        ["19:1", 1],
        ["20:1", 1],
      ]
    : [];
  const expected = sites.map(
    ([location, keyGroupCount]) =>
      `${filename}:${location} Manual review required: migrate this splitProps tuple to reviewed omit-based values.
Why: Solid 2.0.0-rc.21 replaces splitProps with omit, but omit returns one object while splitProps returns a tuple containing one selected object per key group plus a final remainder, so migration depends on how those positions are consumed. This call has ${keyGroupCount} key group(s).
Guidance: Trace the complete tuple destructuring or other call-site use, list the exact keys represented by every group, and trace every downstream consumer and reactive property access for each selected value and the remainder. Design explicit omit-based values only after proving how every old tuple member will be produced and that live reactive property access is preserved. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a replacement when keys are dynamic or overlapping, more than one selected group is consumed, the tuple escapes or is indexed dynamically, rest destructuring or reassignment is involved, props or store proxy identity matters, or any consumer is unclear. Ask for the smallest focused test or runtime observation that exposes each consumed tuple member's keys, value, reactive updates, and identity boundary. Ongoing check: after migration, eslint-plugin-solid's solid/removed-api rule (v2 config) reports this site. Official migration guide: ${MIGRATION_GUIDE}`,
  );

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected splitProps guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every splitProps finding must link the migration guide");
  }
  if (guidance.some((entry) => entry.includes("[S2-PROPS-SPLIT-001]"))) {
    throw new Error("splitProps guidance must not expose the old rule ID");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every splitProps finding must require manual review");
  }

  return null;
};

export default testSplitPropsRule;
