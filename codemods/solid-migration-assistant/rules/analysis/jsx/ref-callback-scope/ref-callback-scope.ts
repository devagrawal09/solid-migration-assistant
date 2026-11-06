import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { isIntrinsicElementName } from "../../../../shared/jsx.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("ref-callbacks-no-longer-owned");

/** Solid 1.x APIs that need an owner and therefore stop working inside a 2.0 ref callback. */
const OWNED_APIS = new Set([
  "onCleanup",
  "onMount",
  "createEffect",
  "createRenderEffect",
  "createComputed",
  "createMemo",
  "createSignal",
  "createResource",
  "createRoot",
  "getOwner",
  "useContext",
]);

/**
 * Reports an inline function passed as a JSX `ref` on an intrinsic element
 * whose body calls an owner-dependent Solid API. Solid 1.x ran ref callbacks
 * inside the component's reactive owner, so `onCleanup` and primitives
 * registered there; at rc.21 ref callbacks are unowned (`getOwner()` is
 * `null`), so such calls no longer register or leak (dev warns with
 * `NO_OWNER_CLEANUP` / `NO_OWNER_EFFECT`). Detection is by callee name inside
 * the inline callback; a ref bound to an identifier is not reported because
 * its body is elsewhere.
 */
export function analyzeRefCallbackScope(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  const findings: string[] = [];
  for (const elementKind of ["jsx_opening_element", "jsx_self_closing_element"] as const) {
    for (const element of rootNode.findAll({ rule: { kind: elementKind } })) {
      if (!isIntrinsicElementName(element.field("name"))) continue;
      for (const attribute of element.children().filter((child) => child.kind() === "jsx_attribute")) {
        const [name, , container] = attribute.children();
        if (name === undefined || name.kind() !== "property_identifier" || name.text() !== "ref") continue;
        if (container === undefined || container.kind() !== "jsx_expression") continue;
        const callback = container
          .children()
          .find((child) => child.kind() === "arrow_function" || child.kind() === "function_expression");
        if (callback === undefined) continue;
        const calls = callback
          .findAll({ rule: { kind: "call_expression" } })
          .map((call) => call.field("function"))
          .filter((callee): callee is SgNode<TSX> => callee !== null && callee.kind() === "identifier")
          .map((callee) => callee.text())
          .filter((callee) => OWNED_APIS.has(callee));
        if (calls.length === 0) continue;
        const start = name.range().start;
        const names = [...new Set(calls)].sort().join(", ");
        findings.push(
          `${context.filename}:${start.line + 1}:${start.column + 1} Manual review required: move owner-dependent work out of this ref callback.
Why: Solid ${SOLID_TARGET_VERSION} runs ref callbacks unowned, so getOwner() is null inside them and the ${names} call(s) here no longer register with the component (Solid 1.x ran the callback inside the component's owner).
Guidance: Keep only element capture in the ref callback. Move one-off setup and its cleanup into onSettled in the component body, returning the cleanup function, or into the owned setup half of a directive factory whose returned apply callback receives the element. Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${MIGRATION_GUIDE}`,
        );
      }
    }
  }
  return findings;
}
