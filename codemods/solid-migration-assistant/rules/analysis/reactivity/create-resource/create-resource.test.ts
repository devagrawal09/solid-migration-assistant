import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeCreateResource } from "./create-resource.ts";

const MIGRATION_GUIDE = "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#createresource--async-computations--loading";

const testCreateResourceRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeCreateResource(root.root(), { filename });

  const isFixture = root.source().includes('from "solid-js"') ||
    root.source().includes('from "solid-js/web"');

  if (isFixture) {
    if (guidance.length === 0) {
      throw new Error("expected createResource findings but got none");
    }
  }

  if (!isFixture) {
    if (guidance.length > 0) {
      throw new Error(
        `unexpected createResource findings in non-Solid fixture: ${guidance.join("\n")}`,
      );
    }
  }

  // Exact sites: three call sites, then the tuple members resolved from the
  // `[user, { refetch, mutate }]` and `[posts]` bindings. `otherObj.loading`
  // and `otherObj.error` (lines 33 and 34) must stay unreported: they are not
  // resource bindings, and a text match would have flagged them.
  if (isFixture) {
    const expectedLocations = ["6:1", "23:37", "37:19", "25:1", "40:20", "26:1", "43:19", "29:1", "46:30", "30:1", "47:30"];
    const actualLocations = guidance.map((entry) => /^[^:]*:(\d+:\d+) /.exec(entry)?.[1] ?? entry);
    if (actualLocations.join(",") !== expectedLocations.join(",")) {
      throw new Error(`expected findings at ${expectedLocations.join(", ")} but got ${actualLocations.join(", ")}`);
    }
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every createResource finding must link the migration guide");
  }

  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every createResource finding must require manual review");
  }

  return null;
};

export default testCreateResourceRule;
