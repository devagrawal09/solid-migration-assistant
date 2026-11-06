import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { MIGRATION_GUIDE_URL, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const GUIDE = MIGRATION_GUIDE_URL;

export function analyzeCreateDynamic(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, "solid-js/web", "createDynamic")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 1 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this createDynamic call to the dynamic(source) factory.
Why: Solid ${SOLID_TARGET_VERSION} removes createDynamic(component, props) in favor of the dynamic(source) factory, which returns a stable component driven by a reactive (optionally async) source; the <Dynamic component={...}> JSX wrapper still exists but is deprecated without a runtime warning.
Guidance: Read the complete component and props arguments. Compose the call as createComponent(dynamic(() => Component), props), or hoist const Active = dynamic(() => Component) to the component body (or the module, for a constant source) and render <Active {...props} />. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${GUIDE}#dynamic-components-createdynamic--dynamic--dynamic-factory`;
    });
}
