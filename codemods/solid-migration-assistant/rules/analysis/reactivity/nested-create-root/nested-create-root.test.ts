import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeNestedCreateRoot } from "./nested-create-root.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#nested-createroot-is-owned-by-its-parent";

const testNestedCreateRootRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeNestedCreateRoot(root.root(), { filename });
  const isFixture = root.source().includes('from "solid-js"');
  if (!isFixture) {
    if (guidance.length > 0) throw new Error(`unexpected findings in non-Solid fixture: ${guidance.join("\n")}`);
    return null;
  }
  const expected = ["6:10", "12:27"];
  const actual = guidance.map((entry) => /^[^:]*:(\d+:\d+) /.exec(entry)?.[1] ?? entry);
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`expected findings at ${expected.join(", ")} but got ${actual.join(", ")}`);
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE) || !entry.includes("Manual review required"))) {
    throw new Error("every finding must link the guide and require manual review");
  }
  return null;
};

export default testNestedCreateRootRule;
