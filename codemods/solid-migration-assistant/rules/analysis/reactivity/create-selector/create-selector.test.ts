import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeCreateSelector } from "./create-selector.ts";

const MIGRATION_GUIDE = "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#quick-rename--removal-map";

const testCreateSelectorRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeCreateSelector(root.root(), { filename });

  const isFixture = root.source().includes('from "solid-js"') ||
    root.source().includes('from "solid-js/web"');

  if (isFixture) {
    if (guidance.length === 0) {
      throw new Error("expected createSelector findings but got none");
    }
  }

  if (!isFixture) {
    if (guidance.length > 0) {
      throw new Error(
        `unexpected createSelector findings in non-Solid fixture: ${guidance.join("\n")}`,
      );
    }
  }

  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every createSelector finding must link the migration guide");
  }

  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every createSelector finding must require manual review");
  }

  return null;
};

export default testCreateSelectorRule;
