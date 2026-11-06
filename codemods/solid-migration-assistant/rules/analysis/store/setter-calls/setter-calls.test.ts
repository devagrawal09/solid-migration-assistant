import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeStoreSetterCalls } from "./setter-calls.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#draft-first-setters";

const testStoreSetterCallsRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeStoreSetterCalls(root.root(), { filename });
  const isFixture = root.source().includes('from "solid-js/store"');

  if (!isFixture) {
    if (guidance.length > 0) {
      throw new Error(`unexpected store setter findings in non-Solid fixture: ${guidance.join("\n")}`);
    }
    return null;
  }

  const expected = [
    ["5:1", "path-style"],
    ["6:1", "path-style"],
    ["7:1", "object-merge"],
    ["8:1", "returns"],
    ["9:1", "returns"],
    ["21:41", "passed as a value"],
    ["22:27", "passed as a value"],
  ];
  const actual = guidance.map((entry) => {
    const location = /^[^:]*:(\d+:\d+) /.exec(entry)?.[1] ?? entry;
    const headline = entry.split("\n")[0] ?? "";
    const kind = headline.includes("path-style")
      ? "path-style"
      : headline.includes("object-merge")
        ? "object-merge"
        : headline.includes("returns")
          ? "returns"
          : headline.includes("passed as a value")
            ? "passed as a value"
            : "?";
    return [location, kind];
  });
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`unexpected store setter findings:\n${JSON.stringify(actual)}\nExpected:\n${JSON.stringify(expected)}`);
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every finding must link the migration guide");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every finding must require manual review");
  }
  return null;
};

export default testStoreSetterCallsRule;
