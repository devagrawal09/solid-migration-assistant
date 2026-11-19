import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { callTakingAsFirstArgument, findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE = migrationGuide("nested-createroot-is-owned-by-its-parent");

const FUNCTION_KINDS = new Set([
  "arrow_function",
  "function_expression",
  "function_declaration",
  "generator_function",
  "generator_function_declaration",
  "method_definition",
]);

const TEST_CALLS = /^(describe|it|test|bench|beforeEach|afterEach|beforeAll|afterAll)\b/;
const TEST_FILE = /(^|\/)__tests__\/|\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * Reports `createRoot` calls that sit inside a function body, where a parent
 * owner may exist at call time. In Solid 1.x such a root lived until its own
 * `dispose()`; at 2.0.0 a root created under an existing owner is that
 * owner's child and is disposed with it. Module-level calls have no parent
 * owner and are not reported, and neither are calls whose only enclosing
 * functions are test-runner callbacks (`it(() => createRoot(...))`) or, in a
 * test file, module-level helpers the tests call: the runner calls them
 * with no owner.
 */
export function analyzeNestedCreateRoot(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  // A test file is named like one or calls the runner at module level.
  const testFile = TEST_FILE.test(context.filename) || rootNode.children().some((statement) =>
    statement.kind() === "expression_statement" && statement.child(0)?.kind() === "call_expression" &&
    TEST_CALLS.test(statement.child(0)?.field("function")?.text() ?? ""));
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "createRoot")
    .filter(({ call, filename }) => {
      const functions = call.ancestors().filter((ancestor) => FUNCTION_KINDS.has(ancestor.kind()));
      if (functions.length === 0) return false;
      return !functions.every((fn) => {
        const runner = callTakingAsFirstArgument(fn) ?? fn.parent()?.parent();
        if (runner?.kind() === "call_expression" && TEST_CALLS.test(runner.field("function")?.text() ?? "")) return true;
        return filename === context.filename && testFile && fn.ancestors().every((ancestor) => !FUNCTION_KINDS.has(ancestor.kind()));
      });
    })
    .map(({ call, filename }) => {
      const start = call.range().start;
      return finding(filename, start, {
        severity: "behavior",
        headline: `Decide this nested createRoot's lifetime.`,
        why: `Solid ${SOLID_TARGET_VERSION} parents a root created inside an existing owner to that owner and disposes it with the owner; Solid 1.x kept a nested root alive until its own dispose() was called.`,
        guidance: `Determine whether a parent owner can exist when this call runs. If the root must outlive its creator, wrap the call as runWithOwner(null, () => createRoot(...)) to detach it; if it should be disposed with the creator, keep the call and remove any manual dispose bookkeeping that becomes redundant.`,
        guide: MIGRATION_GUIDE,
      });
    });
}
