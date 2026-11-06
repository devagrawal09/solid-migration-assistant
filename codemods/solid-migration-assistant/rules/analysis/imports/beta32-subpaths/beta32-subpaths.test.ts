import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeBeta32SubpathImports } from "./beta32-subpaths.ts";

const MIGRATION_GUIDE =
  "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#imports-where-things-live-now";
const STORE_STOP_CONDITION =
  "Stop: do not blindly rewrite this source. The plain createStore setter in Solid 2 accepts only a draft callback, setStore(state => { ... }); 1.x path setters such as setStore(\"user\", \"name\", value) and object merges such as setStore({ count: 1 }) must become draft writes, reconcile(value, options) became reconcile(value, key), and unwrap, produce, createMutable, and modifyMutable are renamed or removed. Migrate those call sites first, then move the surviving store imports to solid-js.";
const LINT_HINT =
  " Ongoing check: after migration, eslint-plugin-solid's solid/removed-api rule (v2 config) reports this site.";
const EXPECTED_SITES = [
  // Static imports
  { location: "1:29", legacy: "solid-js/store", replacement: "solid-js", form: "static import" },
  { location: "2:15", legacy: "solid-js/h", replacement: "@solidjs/h", form: "static import" },
  { location: "3:18", legacy: "solid-js/html", replacement: "@solidjs/html", form: "static import" },
  { location: "4:32", legacy: "solid-js/universal", replacement: "@solidjs/universal", form: "static import" },
  { location: "5:21", legacy: "solid-js/jsx-runtime", replacement: "@solidjs/web/jsx-runtime", form: "static import" },
  { location: "6:24", legacy: "solid-js/jsx-dev-runtime", replacement: "@solidjs/web/jsx-dev-runtime", form: "static import" },
  { location: "8:28", legacy: "solid-js/store", replacement: "solid-js", form: "static import" },
  { location: "9:35", legacy: "solid-js/h", replacement: "@solidjs/h", form: "static import" },
  { location: "11:39", legacy: "solid-js/html", replacement: "@solidjs/html", form: "static import" },
  { location: "12:36", legacy: "solid-js/html", replacement: "@solidjs/html", form: "static import" },
  { location: "13:50", legacy: "solid-js/universal", replacement: "@solidjs/universal", form: "static import" },
  { location: "14:41", legacy: "solid-js/jsx-runtime", replacement: "@solidjs/web/jsx-runtime", form: "static import" },
  { location: "15:37", legacy: "solid-js/jsx-dev-runtime", replacement: "@solidjs/web/jsx-dev-runtime", form: "static import" },
  // Re-exports
  { location: "18:48", legacy: "solid-js/store", replacement: "solid-js", form: "re-export" },
  { location: "19:15", legacy: "solid-js/h", replacement: "@solidjs/h", form: "re-export" },
  // Dynamic import
  { location: "21:28", legacy: "solid-js/html", replacement: "@solidjs/html", form: "dynamic import()" },
  // Require
  { location: "23:35", legacy: "solid-js/universal", replacement: "@solidjs/universal", form: "require() call" },
  // Type import expression
  { location: "24:28", legacy: "solid-js/jsx-runtime", replacement: "@solidjs/web/jsx-runtime", form: "dynamic import()" },
] as const;

const testBeta32SubpathRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeBeta32SubpathImports(root.root(), { filename });
  const expected = EXPECTED_SITES.map(
    ({ location, legacy, replacement, form }) => `${filename}:${location} Move this Solid 2 legacy subpath ${form}.
Why: Solid 2 publishes ${legacy} from ${replacement}.
Guidance:${form === "re-export" ? " Change only this re-export's module source and preserve its export form and quote style." : form === "dynamic import()" ? " Change only this dynamic import's module source and preserve its quote style." : form === "require() call" ? " Change only this require call's module source and preserve its quote style." : " Change only this static import's module source and preserve its import form and quote style."} Make and validate that edit yourself; this analyzer never edits or runs the target project.${legacy === "solid-js/store" ? ` ${STORE_STOP_CONDITION}${LINT_HINT}` : ""} Official migration guide: ${MIGRATION_GUIDE}`,
  );

  if (guidance.join("\n---finding---\n") !== expected.join("\n---finding---\n")) {
    throw new Error(
      `unexpected legacy subpath guidance:\n${guidance.join("\n---finding---\n")}`,
    );
  }
  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every legacy subpath finding must link the migration guide");
  }
  if (guidance.some((entry) => entry.includes("[S2-IMPORT-BETA32-001]"))) {
    throw new Error("legacy subpath guidance must not expose the old rule ID");
  }
  guidance.forEach((entry, index) => {
    const isStoreImport = EXPECTED_SITES[index]!.legacy === "solid-js/store";
    if (entry.includes(STORE_STOP_CONDITION) !== isStoreImport) {
      throw new Error(`unexpected store stop condition: ${entry}`);
    }
  });

  const source = root.source();
  for (const nearestNegative of [
    'from "solid-js"',
    'from "@solidjs/h"',
    'from "@solidjs/html"',
    'from "@solidjs/universal"',
    'from "@solidjs/web/jsx-runtime"',
    'from "@solidjs/web/jsx-dev-runtime"',
    'from "solid-js/web"',
    'from "solid-js/store-extra"',
    'from "vendor/solid-js/store"',
    'from "solid-js/store/"',
    'solid-js\\\\x2fstore',
  ]) {
    if (!source.includes(nearestNegative)) {
      throw new Error(`missing nearest-negative fixture: ${nearestNegative}`);
    }
  }

  return null;
};

export default testBeta32SubpathRule;
