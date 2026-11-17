import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { isIntrinsicElementName } from "../../../../shared/jsx.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { MIGRATION_GUIDE_URL, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const FUNCTION_KINDS = new Set(["arrow_function", "function_expression", "function"]);
const DIAGNOSTICS_GUIDE = MIGRATION_GUIDE_URL.replace("MIGRATION.md", "08-dev-diagnostics.md");

/**
 * Reports event handler expressions on native elements that call something
 * to pick the handler, such as `onClick={selected() ? a : b}`. Both 1.9 and
 * 2.0.0 compile the expression to one read when the element is created
 * (checked with babel-preset-solid 1.9 and @solidjs/babel-plugin 2.0.0), so
 * behavior is the same; 2.0.0 dev builds add a STRICT_READ_UNTRACKED warning
 * when the read touches reactive state. `.bind(...)` and calls inside a
 * function literal are not counted, and so are calls with arguments, which
 * are usually handler factories rather than reads.
 */
export function analyzeHandlerReads(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return rootNode
    .findAll({ rule: { kind: "jsx_attribute", inside: { any: [{ kind: "jsx_opening_element" }, { kind: "jsx_self_closing_element" }] } } })
    .filter((attribute) => isIntrinsicElementName(attribute.parent()?.field("name") ?? null))
    .flatMap((attribute) => {
      const name = attribute.children()[0];
      if (name?.kind() !== "property_identifier" || !/^on[A-Z]/.test(name.text())) return [];
      const value = attribute.children().find((child) => child.kind() === "jsx_expression");
      const expression = value?.children().find((child) => child.isNamed() && child.kind() !== "comment");
      if (expression === undefined || FUNCTION_KINDS.has(expression.kind()) || !callsOutsideFunctions(expression)) return [];
      return [
        finding(context.filename, expression, {
          severity: "deprecated",
          headline: `Pick the ${name.text()} handler inside a function instead of when the element is created.`,
          why: `This expression runs once, when the element is created, in Solid 1.x and in Solid ${SOLID_TARGET_VERSION} alike. If it reads a signal, store or prop, Solid ${SOLID_TARGET_VERSION} dev builds warn STRICT_READ_UNTRACKED, because the handler will not follow later changes.`,
          guidance: `If the expression reads reactive state and the handler should follow it, move the read into the handler: ${name.text()}={(event) => (${expression.text().length > 40 ? "<expression>" : expression.text()})(event)}. If it only reads constants, nothing changes and this can be left.`,
          guide: `${DIAGNOSTICS_GUIDE}#strict_read_untracked`,
        }),
      ];
    });
}

function callsOutsideFunctions(expression: SgNode<TSX>): boolean {
  return expression.findAll({ rule: { kind: "call_expression" } }).some((call) => {
    const callee = call.field("function");
    const args = call.field("arguments")?.children().filter((child) => child.isNamed() && child.kind() !== "comment") ?? [];
    if (args.length > 0) return false;
    for (const ancestor of call.ancestors()) {
      if (ancestor.id() === expression.id()) return true;
      if (FUNCTION_KINDS.has(ancestor.kind())) return false;
    }
    return true;
  });
}
