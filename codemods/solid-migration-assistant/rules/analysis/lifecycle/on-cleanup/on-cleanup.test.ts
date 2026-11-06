import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeOnCleanup } from "./on-cleanup.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup";

const testOnCleanupRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const registrations = [analyzeOnCleanup];
  const guidance = registrations.flatMap((analyzer) =>
    analyzer(root.root(), { filename }),
  );

  const isFixture = root.source().includes('from "solid-js"') ||
    root.source().includes('from "solid-js/web"');

  if (isFixture) {
    const expected = [
      ["9:3", "createEffect callback"],
      ["15:3", "onMount callback"],
      ["20:3", "createEffect callback"],
      ["21:3", "createEffect callback"],
    ];
    const actual = guidance.map((entry) => [
      /^[^:]*:(\d+:\d+) /.exec(entry)?.[1] ?? entry,
      /out of the (\w+ callback)/.exec(entry)?.[1] ?? "?",
    ]);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`unexpected onCleanup findings:\n${JSON.stringify(actual)}\nExpected:\n${JSON.stringify(expected)}`);
    }
  }

  if (!isFixture) {
    if (guidance.length > 0) {
      throw new Error(
        `unexpected onCleanup findings in non-Solid fixture: ${guidance.join("\n")}`,
      );
    }
  }

  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every onCleanup finding must link the migration guide");
  }

  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every onCleanup finding must require manual review");
  }

  return null;
};

export default testOnCleanupRule;
