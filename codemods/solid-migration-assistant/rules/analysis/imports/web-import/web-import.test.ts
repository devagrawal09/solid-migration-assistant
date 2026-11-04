import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeWebImport } from "./web-import.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now";

const EXPECTED_SITES = [
  // Static imports
  { location: "1:24", form: "static import" },
  { location: "2:8", form: "static import" },
  { location: "3:41", form: "static import" },
  { location: "5:41", form: "static import" },
  { location: "6:38", form: "static import" },
  { location: "7:42", form: "static import" },
  { location: "8:44", form: "static import" },
  { location: "9:37", form: "static import" },
  // Re-export
  { location: "13:25", form: "re-export" },
  // Dynamic import
  { location: "15:30", form: "dynamic import()" },
  // Require
  { location: "17:32", form: "require() call" },
  // Type import expression
  { location: "18:24", form: "dynamic import()" },
] as const;

const testWebImportRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeWebImport(root.root(), { filename });
  const expected = EXPECTED_SITES.map(
    ({ location, form }) => {
      const formLabel = form;
      const formGuidance =
        form === "re-export"
          ? " Change only this re-export's module source to @solidjs/web and preserve its export form and quote style."
          : form === "dynamic import()"
            ? " Change only this dynamic import's module source to @solidjs/web and preserve its quote style."
            : form === "require() call"
              ? " Change only this require call's module source to @solidjs/web and preserve its quote style."
              : " Change only this static import's module source to @solidjs/web and preserve its import form and quote style.";
      return `${filename}:${location} Move this Solid web renderer ${formLabel}.
Why: Solid 2 publishes the web renderer from @solidjs/web instead of the solid-js/web subpath.
Guidance:${formGuidance} Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}`;
    },
  );

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(`unexpected web-import guidance:\n${guidance.join("\n---finding---\n")}`);
  }
  if (guidance.some((entry) => entry.includes("[S2-IMPORT-WEB-001]"))) {
    throw new Error("web-import guidance must not expose a rule ID");
  }

  const source = root.source();
  for (const nearestNegative of [
    'solid-js\\x2fweb',
    'from "@solidjs/web"',
    'from "solid-js/web-extra"',
    'from "vendor/solid-js/web"',
    'from "solid-js/web/"',
  ]) {
    if (!source.includes(nearestNegative)) {
      throw new Error(`missing nearest-negative fixture: ${nearestNegative}`);
    }
  }

  return null;
};

export default testWebImportRule;
