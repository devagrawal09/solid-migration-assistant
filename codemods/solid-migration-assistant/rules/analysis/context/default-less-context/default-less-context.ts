import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { enclosingFunction, findImportedCalls } from "../../../../shared/analysis.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { referencesOf } from "../../../../shared/semantic.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("usecontext-on-a-default-less-context-returns-t-not-t--undefined");
const EMPTY = new Set(["undefined", "null"]);

/**
 * Reports `useContext(Ctx)` results that are checked for undefined, where
 * `Ctx` is a default-less `createContext()` (no argument, or `undefined`).
 * Solid 1.x returned undefined outside a Provider; Solid 2.0.3 throws
 * ContextNotFoundError instead, so the check never sees undefined.
 *
 * A check is `!ctx`, a comparison with undefined or null, `ctx ?? x`,
 * `ctx?.x`, `ctx && x`, `ctx || x`, or ctx as an `if` or ternary condition,
 * on the call itself or on the one const it is assigned to. When every check
 * only throws, the hook was a type-narrowing wrapper and the finding is a
 * cleanup; otherwise the fallback branch is dead and behavior changes.
 */
export function analyzeDefaultLessContext(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  const contextReferences = new Set<string>();
  for (const { call, argumentNodes } of findImportedCalls(rootNode, "solid-js", "createContext")) {
    if (argumentNodes.length > 0 && !(argumentNodes.length === 1 && argumentNodes[0]!.text() === "undefined")) continue;
    const declarator = call.parent();
    const name = declarator?.kind() === "variable_declarator" ? declarator.field("name") : null;
    if (name?.kind() !== "identifier") continue;
    for (const { root, nodes } of referencesOf(name)) {
      const filename = root.relativeFilename().replaceAll("\\", "/");
      for (const node of nodes) contextReferences.add(`${filename}:${node.id()}`);
    }
  }

  return findImportedCalls(rootNode, "solid-js", "useContext").flatMap(({ call, argumentNodes, filename }) => {
    const target = argumentNodes[0];
    if (target === undefined || !contextReferences.has(`${filename}:${target.id()}`)) return [];
    const checks = undefinedChecks(call);
    if (checks.length === 0) return [];
    const onlyThrows = checks.every(throwsWhenEmpty);
    const line = checks[0]!.range().start.line + 1;
    return [
      finding(filename, call, {
        severity: onlyThrows ? "deprecated" : "behavior",
        headline: onlyThrows
          ? `Drop the undefined check on line ${line}; useContext(${target.text()}) now throws without a Provider.`
          : `The undefined fallback on line ${line} never runs; useContext(${target.text()}) now throws without a Provider.`,
        why: `${target.text()} is created without a default. Solid 1.x returned undefined from useContext outside a Provider; Solid ${SOLID_TARGET_VERSION} types the result as the context's type and throws ContextNotFoundError instead.`,
        guidance: onlyThrows
          ? `Delete the check and return the useContext result directly; the hook only existed to narrow the type. If many callers use the hook, keeping it as a one-line alias is fine.`
          : `If code here must work outside a Provider, give the context an explicit empty value, createContext<T | null>(null), and check for null. undefined is never a context value in Solid 2, so createContext<T | undefined>(undefined) still throws. Otherwise remove the fallback.`,
        guide: MIGRATION_GUIDE,
      }),
    ];
  });
}

/** The nodes that test the call's result for emptiness. */
function undefinedChecks(call: SgNode<TSX>): SgNode<TSX>[] {
  const direct = checkAround(call);
  if (direct !== null) return [direct];
  const declarator = call.parent();
  const name = declarator?.kind() === "variable_declarator" ? declarator.field("name") : null;
  const scope = enclosingFunction(call);
  if (name?.kind() !== "identifier" || scope === null) return [];
  return scope
    .findAll({ rule: { kind: "identifier", regex: `^${name.text().replace(/\$/g, "\\$")}$` } })
    .filter((reference) => reference.id() !== name.id())
    .map(checkAround)
    .filter((check): check is SgNode<TSX> => check !== null);
}

function checkAround(value: SgNode<TSX>): SgNode<TSX> | null {
  const parent = value.parent();
  if (parent === null) return null;
  switch (parent.kind()) {
    case "unary_expression":
      return parent.text().startsWith("!") ? parent : null;
    case "binary_expression": {
      const operator = parent.field("operator")?.text() ?? "";
      if (["??", "&&", "||"].includes(operator)) return parent.field("left")?.id() === value.id() ? parent : null;
      if (!["==", "===", "!=", "!=="].includes(operator)) return null;
      const other = parent.field("left")?.id() === value.id() ? parent.field("right") : parent.field("left");
      return other !== null && EMPTY.has(other.text()) ? parent : null;
    }
    case "member_expression":
    case "call_expression":
      return parent.children().some((child) => child.kind() === "optional_chain") && parent.child(0)?.id() === value.id() ? parent : null;
    case "parenthesized_expression": {
      const holder = parent.parent();
      return holder?.kind() === "if_statement" && holder.field("condition")?.id() === parent.id() ? parent : null;
    }
    case "ternary_expression":
      return parent.field("condition")?.id() === value.id() ? parent : null;
    default:
      return null;
  }
}

/** True for `if (!ctx) throw ...`. */
function throwsWhenEmpty(check: SgNode<TSX>): boolean {
  const condition = check.parent();
  const statement = condition?.parent();
  if (condition?.kind() !== "parenthesized_expression" || statement?.kind() !== "if_statement") return false;
  if (!check.text().startsWith("!") && !/^[^=!]*===?\s*(undefined|null)$/.test(check.text())) return false;
  const consequence = statement.field("consequence");
  if (consequence === null) return false;
  if (consequence.kind() === "throw_statement") return true;
  const statements = consequence.children().filter((child) => child.isNamed() && child.kind() !== "comment");
  return statements.length === 1 && statements[0]!.kind() === "throw_statement";
}
