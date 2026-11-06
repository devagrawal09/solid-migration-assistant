import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeDomLowercaseEvents } from "./dom-lowercase-events.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#attributes--events-closer-to-html-and-fewer-namespaces";

const testDomLowercaseEventsRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeDomLowercaseEvents(root.root(), { filename });

  const expectedLocations = ["11:15", "12:14", "13:19", "14:27"];
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

  // Component props and camelCase handlers are never reported.
  if (guidance.some((entry) => /:15:\d+ |:16:\d+ /.test(entry))) {
    throw new Error("component props and camelCase handlers must not be reported");
  }

  return null;
};

export default testDomLowercaseEventsRule;
