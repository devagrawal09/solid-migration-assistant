import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeCreateMutable, analyzeModifyMutable } from "./mutable.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#createmutable--modifymutable--createstore-with-draft-setters";

const testMutableRules: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const isDirectFixture = root.source().includes('from "solid-js/store"');

  const createGuidance = analyzeCreateMutable(root.root(), {
    filename: "ignored-context-filename.tsx",
  });
  const expectedCreate = isDirectFixture
    ? [
        createExpected(filename, "15:15", 1),
        createExpected(filename, "17:20", 2),
        createExpected(filename, "35:1", 1),
        createExpected(filename, "37:1", 1),
      ]
    : [];
  assertExact("createMutable", createGuidance, expectedCreate);

  const modifyGuidance = analyzeModifyMutable(root.root(), {
    filename: "ignored-context-filename.tsx",
  });
  const expectedModify = isDirectFixture
    ? [modifyExpected(filename, "18:1"), modifyExpected(filename, "22:1"),
       modifyExpected(filename, "36:1"), modifyExpected(filename, "38:1")]
    : [];
  assertExact("modifyMutable", modifyGuidance, expectedModify);

  for (const guidance of [createGuidance, modifyGuidance]) {
    if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
      throw new Error("every mutable finding must link the migration guide");
    }
    if (
      guidance.some(
        (entry) =>
          entry.includes("[S2-STORE-CREATE-MUTABLE-001]") ||
          entry.includes("[S2-STORE-MODIFY-MUTABLE-001]"),
      )
    ) {
      throw new Error("mutable guidance must not expose the old rule IDs");
    }
    if (guidance.some((entry) => !entry.includes("Manual review required"))) {
      throw new Error("every mutable finding must require manual review");
    }
  }

  return null;
};

function createExpected(
  filename: string,
  location: string,
  argumentCount: number,
): string {
  return `${filename}:${location} Manual review required: migrate this createMutable call to an owned createStore tuple.
Why: Solid 2.0.0-rc.21 removes createMutable in favor of createStore, which returns a store-and-setter tuple rather than the directly mutable proxy this call creates. This call has exactly ${argumentCount} semantic argument(s), so its initial value and any second options argument require review before the value and every write can move to that tuple.
Guidance: Trace the created value through every alias, return, call site, and write, identify its owner and every reader and writer, and review a second options argument separately. Introduce createStore only after mapping every property assignment, delete, and mutating array operation to the tuple's explicit setter, including the exact setter path or draft-first setter callback needed to preserve selection and sequencing. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the value escapes, a consumer requires direct mutation or proxy identity, mutation happens through an unknown helper, setter paths cannot be identified, ownership is unclear, or focused tests do not cover the affected reads and writes. Ask for the smallest focused test or runtime observation that exposes the value's reads, writes, identity, and ownership boundary. Official migration guide: ${MIGRATION_GUIDE}`;
}

function modifyExpected(filename: string, location: string): string {
  return `${filename}:${location} Manual review required: migrate this modifyMutable call to its target store's setter.
Why: Solid 2.0.0-rc.21 removes modifyMutable; a createStore tuple's draft-first setter can replace this mutation entry point only after the target is resolved to its store owner, the complete recipe is reviewed, and the exact setter mapping is established.
Guidance: Resolve the first target argument to its exact createMutable owner and planned createStore tuple, inspect the complete second-argument mutation recipe, and map that recipe to the owner's explicit setter while preserving the setter overload, path selection, and update sequencing. Make and validate this migration yourself; this analyzer never edits or runs the target project. Stop without proposing a rewrite when the target origin or setter is unknown, the state or recipe escapes, mutation is delegated to an unknown helper, the callback returns a meaningful value, nested updates or async work are present, or focused tests do not expose the affected reads and writes. Ask for the smallest focused test or runtime observation that exposes the selected target owner, setter path, recipe result, and resulting store update. Official migration guide: ${MIGRATION_GUIDE}`;
}

function assertExact(
  rule: string,
  guidance: string[],
  expected: string[],
): void {
  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected ${rule} guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
}

export default testMutableRules;
