import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { MIGRATION_GUIDE_URL } from "../../../../shared/target.ts";

const GUIDE =
  MIGRATION_GUIDE_URL;

function utilityGuidance(
  name: string,
  call: SgNode<TSX>,
  filename: string,
): string {
  const start = call.range().start;
  const headline =
    name === "equalFn" || name === "getListener"
      ? `migrate this ${name} reference to its Solid 2 replacement`
      : `remove this ${name} call`;
  const why: Record<string, string> = {
    equalFn:
      "Solid 2 renames equalFn to isEqual with the same (a, b) => boolean signature.",
    getListener:
      "Solid 2 renames getListener to getObserver with the same signature.",
    writeSignal:
      "Solid 2 removes writeSignal; batching is now default — use the normal setter.",
    enableScheduling:
      "Solid 2 removes enableScheduling; the global scheduler no longer exists.",
  };
  const steps: Record<string, string> = {
    equalFn:
      "Replace every reference to equalFn with isEqual. No other changes are required — the signature is identical.",
    getListener:
      "Replace every reference to getListener with getObserver. No other changes are required — the signature is identical.",
    writeSignal:
      "Remove this call. Replace with the signal's normal setter; updates are batched automatically.",
    enableScheduling:
      "Remove this call. Solid 2 has no global scheduler toggle.",
  };
  return `${filename}:${start.line + 1}:${start.column + 1} Manual review required: ${headline}
Why: ${why[name]}
Guidance: ${steps[name]} Make and validate that edit yourself; this analyzer never edits or runs the target project. Official migration guide: ${GUIDE}#quick-rename--removal-map`;
}

export function analyzeEqualFn(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "equalFn").map(
    ({ call, filename }) => utilityGuidance("equalFn", call, filename),
  );
}

export function analyzeGetListener(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "getListener").map(
    ({ call, filename }) => utilityGuidance("getListener", call, filename),
  );
}

export function analyzeWriteSignal(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "writeSignal").map(
    ({ call, filename }) => utilityGuidance("writeSignal", call, filename),
  );
}

export function analyzeEnableScheduling(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): string[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "enableScheduling").map(
    ({ call, filename }) => utilityGuidance("enableScheduling", call, filename),
  );
}
