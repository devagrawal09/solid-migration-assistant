import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("directives-use--ref-directive-factories-two-phase-pattern");

export function analyzeDomUseDirective(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  const findings: string[] = [];
  for (const elementKind of ["jsx_opening_element", "jsx_self_closing_element"] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      for (const attribute of element
        .children()
        .filter((child) => child.kind() === "jsx_attribute")) {
        const nameNode = attribute
          .children()
          .find((child) => child.kind() === "jsx_namespace_name");
        if (!nameNode) continue;
        const name = nameNode.text();
        if (!name.startsWith("use:")) continue;
        const start = nameNode.range().start;
        const directiveName = name.slice(4);
        findings.push(
          `${context.filename}:${start.line + 1}:${start.column + 1} Manual review required: migrate this use: directive to a ref directive factory.
Why: Solid ${SOLID_TARGET_VERSION} removes use: directives (the compiler rejects them on native elements); custom element behaviors use ref directive factories with a two-phase pattern: an owned setup phase that creates primitives, effects, and onCleanup registrations, which returns an unowned apply callback that receives the element.
Guidance: Replace use:${directiveName}={options} with ref={${directiveName}(options)} (or ref={${directiveName}} when the directive takes no options; arrays compose as ref={[a, b]}). Rewrite the directive itself as a factory function that performs its setup in the owned body and returns the element callback (el) => { ... } for DOM writes. Read the directive's source, identify its element setup and teardown logic, and port them to that pattern. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}`,
        );
      }
    }
  }
  return findings;
}
