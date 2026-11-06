import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeJsxTypeImports } from "./jsx-types.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#typescript-jsx-solid-js--renderer-package";

const testJsxTypesRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeJsxTypeImports(root.root(), { filename });

  const expectedLocations = ["2:15", "2:20", "3:10", "1:1"];
  const actualLocations = guidance.map(
    (entry) => /^[^:]*:(\d+:\d+) /.exec(entry)?.[1] ?? entry,
  );
  if (actualLocations.join(",") !== expectedLocations.join(",")) {
    throw new Error(
      `expected findings at ${expectedLocations.join(", ")} but got ${actualLocations.join(", ")}`,
    );
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every finding must link the migration guide");
  }
  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every finding must require manual review");
  }
  if (!guidance[1]?.includes("JSXElement")) {
    throw new Error("the JSXElement specifier must get its own replacement guidance");
  }
  if (guidance.some((entry) => entry.includes("@solidjs/web\" from"))) {
    throw new Error("imports already on @solidjs/web must not be reported");
  }
  return null;
};

export default testJsxTypesRule;
