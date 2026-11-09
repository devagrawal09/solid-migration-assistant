import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { MIGRATION_GUIDE_URL, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const GUIDE =
  MIGRATION_GUIDE_URL;

function transitionGuidance(
  name: string,
  call: SgNode<TSX>,
  filename: string,
): RuleFinding {
  const start = call.range().start;
  const reasons: Record<string, string> = {
    startTransition:
      "Solid 2 removes startTransition; use built-in transition batching with isPending() to observe in-flight state.",
    useTransition:
      "Solid 2 removes useTransition; use isPending() and Loading boundaries to track transition state.",
    createDeferred:
      "Solid ${SOLID_TARGET_VERSION} keeps the createDeferred name with a new meaning: an async memo that may lag but never leads, keeping its last answer while a refetch is in flight (isPending reports the refetch). The 1.x idle-time deferral and the timeoutMs option are gone, and with a synchronous function it behaves like createMemo.",
  };
  const steps: Record<string, string> = {
    startTransition:
      "Remove the startTransition wrapper. The callback's writes are batched automatically. Add isPending() checks where the caller previously observed the pending boolean.",
    useTransition:
      "Replace useTransition() with isPending(fn) at each site that previously read the pending flag. Wrap the JSX with Loading boundaries for in-flight fallback UI.",
    createDeferred:
      "Decide whether the call wanted idle-time deferral (replace with a plain createMemo or a direct read of the source, since values update after the microtask flush) or lag-tolerant async derivation (keep createDeferred, drop any timeoutMs option, and observe refetches with isPending).",
  };
  const headline =
    name === "createDeferred"
      ? "Review this createDeferred call against its Solid 2 meaning."
      : `Migrate this ${name} call to Solid 2 built-in transitions.`;
  return finding(filename, start, {
        severity: name === "createDeferred" ? "behavior" : "build",
        headline,
        why: `${reasons[name]}`,
        guidance: `${steps[name]}`,
        lint: ["removed-api"],
        guide: `${GUIDE}#async-data--transitions`,
      });
}

export function analyzeStartTransition(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "startTransition")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length === 1 &&
        argumentNodes[0]?.kind() !== "spread_element",
    )
    .map(({ call, filename }) =>
      transitionGuidance("startTransition", call, filename),
    );
}

export function analyzeUseTransition(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "useTransition")
    .filter(({ argumentNodes }) => argumentNodes.length === 0)
    .map(({ call, filename }) =>
      transitionGuidance("useTransition", call, filename),
    );
}

export function analyzeCreateDeferred(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "createDeferred")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 1 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, filename }) =>
      transitionGuidance("createDeferred", call, filename),
    );
}
