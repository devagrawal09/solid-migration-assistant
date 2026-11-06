import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import {
  analyzeStartTransition,
  analyzeUseTransition,
  analyzeCreateDeferred,
} from "./transition-apis.ts";

const MIGRATION_GUIDE = "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#async-data--transitions";

const testStartTransitionRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const registrations = [
    analyzeStartTransition,
    analyzeUseTransition,
    analyzeCreateDeferred,
  ];
  const guidance = registrations.flatMap((analyzer) =>
    analyzer(root.root(), { filename }),
  );

  const isFixture = root.source().includes('from "solid-js"') ||
    root.source().includes('from "solid-js/web"');

  if (isFixture) {
    if (guidance.length === 0) {
      throw new Error(`expected startTransition/useTransition/createDeferred findings but got none`);
    }
  }

  if (!isFixture) {
    if (guidance.length > 0) {
      throw new Error(
        `unexpected startTransition/useTransition/createDeferred findings in non-Solid fixture: ${guidance.join("\n")}`,
      );
    }
  }

  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error(`every startTransition/useTransition/createDeferred finding must link the migration guide`);
  }

  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error(`every startTransition/useTransition/createDeferred finding must require manual review`);
  }

  return null;
};

export default testStartTransitionRule;
