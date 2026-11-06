import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeCreateEffect } from "./create-effect.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#effects-lifecycle-and-cleanup";

const testCreateEffectRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeCreateEffect(root.root(), { filename });

  const isFixture = root.source().includes('from "solid-js"') ||
    root.source().includes('from "solid\\x2djs"');

  if (isFixture) {
    if (guidance.length === 0) {
      throw new Error("expected createEffect findings but got none");
    }
  }

  if (!isFixture) {
    if (guidance.length > 0) {
      throw new Error(
        `unexpected createEffect findings in non-Solid fixture: ${guidance.join("\n")}`,
      );
    }
  }

  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every createEffect finding must link the migration guide");
  }

  if (guidance.some((entry) => entry.includes("[S2-EFFECT-001]"))) {
    throw new Error("createEffect guidance must not expose the old rule ID");
  }

  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every createEffect finding must require manual review");
  }

  // Verify each finding starts with the correct location prefix
  for (const entry of guidance) {
    if (!entry.startsWith(filename)) {
      throw new Error(`finding must start with filename: ${entry}`);
    }
  }

  // Verify we have findings for all expected call sites
  // 1-arg sites (7 total: 5 direct + alias + namespace)
  const oneArgSites = ["6:1", "11:1", "16:1", "17:1", "19:1", "48:1", "49:1"];
  // 0-arg sites
  const zeroArgSites = ["15:1", "43:1"];
  // 2-arg sites (already split + initialValue)
  const twoArgSites = ["21:1", "26:1"];
  // 3-arg site
  const threeArgSites = ["34:1"];

  const allExpected = isFixture
    ? [...oneArgSites, ...zeroArgSites, ...twoArgSites, ...threeArgSites]
    : [];

  const foundLocations = guidance.map((entry) => {
    const afterFile = entry.slice(filename.length + 1);
    const spaceIdx = afterFile.indexOf(" ");
    return spaceIdx >= 0 ? afterFile.slice(0, spaceIdx) : afterFile;
  });

  for (const loc of allExpected) {
    if (!foundLocations.includes(loc)) {
      throw new Error(`missing finding for location ${loc}. Found: ${foundLocations.join(", ")}`);
    }
  }

  if (isFixture && foundLocations.length !== allExpected.length) {
    throw new Error(
      `expected ${allExpected.length} findings but got ${foundLocations.length}. ` +
      `Expected: ${allExpected.join(", ")}. Found: ${foundLocations.join(", ")}`,
    );
  }

  return null;
};

export default testCreateEffectRule;
