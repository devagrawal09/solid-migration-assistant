import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { analyzeDomAttrNamespaces } from "./dom-attr-namespaces.ts";

const MIGRATION_GUIDE = "https://github.com/solidjs/solid/blob/2105ffb8ca2fced55f5fac0763177fc93f97c2c2/documentation/solid-2.0/MIGRATION.md#attributes--events-closer-to-html-and-fewer-namespaces";

const testDomAttrNamespacesRule: Codemod<TSX> = async (root) => {
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const guidance = analyzeDomAttrNamespaces(root.root(), { filename });

  if (guidance.length === 0) {
    throw new Error("expected findings but got none");
  }

  if (guidance.some((entry) => !entry.includes(MIGRATION_GUIDE))) {
    throw new Error("every finding must link the migration guide");
  }

  if (guidance.some((entry) => !entry.includes("Manual review required"))) {
    throw new Error("every finding must require manual review");
  }

  return null;
};

export default testDomAttrNamespacesRule;
