import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeRefCallbackScope } from "./ref-callback-scope.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#ref-callbacks-no-longer-owned";

const testRefCallbackScopeRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeRefCallbackScope(root.root(), { filename });
  const expected = ["15:9", "20:14"];
  const actual = guidance.map((entry) => /^[^:]*:(\d+:\d+) /.exec(entry)?.[1] ?? entry);
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`expected findings at ${expected.join(", ")} but got ${actual.join(", ")}`);
  }
  if (!guidance[0]?.includes("onCleanup call(s)") || !guidance[1]?.includes("createEffect call(s)")) {
    throw new Error("findings must name the owner-dependent calls");
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE) || !entry.includes("Manual review required"))) {
    throw new Error("every finding must link the guide and require manual review");
  }
  return null;
};

export default testRefCallbackScopeRule;
