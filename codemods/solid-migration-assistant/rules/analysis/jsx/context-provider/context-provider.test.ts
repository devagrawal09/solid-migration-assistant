import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeContextProvider } from "./context-provider.ts";

const MIGRATION_GUIDE = "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#context-providers-contextprovider--context-is-the-provider";

const testContextProviderRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeContextProvider(root.root(), { filename });

  const expectedLocations = ["8:5", "9:7"];
  const actualLocations = guidance.map((entry) => /^[^:]*:(\d+:\d+) /.exec(entry)?.[1] ?? entry);
  if (actualLocations.join(",") !== expectedLocations.join(",")) {
    throw new Error(`expected findings at ${expectedLocations.join(", ")} but got ${actualLocations.join(", ")}`);
  }

  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every finding must link the migration guide");
  }

  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every finding must require manual review");
  }

  return null;
};

export default testContextProviderRule;
