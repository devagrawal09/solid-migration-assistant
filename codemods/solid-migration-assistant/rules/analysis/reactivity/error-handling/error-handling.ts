import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { findImportedCalls } from "../../../../shared/analysis.ts";
import { migrationGuide } from "../../../../shared/target.ts";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";

const MIGRATION_GUIDE =
  migrationGuide("onerror--catcherror--errored--effect-error-option");

export function analyzeOnError(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "onError")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 1 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return finding(filename, start, {
        severity: "build",
        headline: `Migrate this onError callback to an Errored boundary.`,
        why: `Solid 2 removes onError; error handling uses Errored components whose fallback receives an error accessor rather than a raw error value.`,
        guidance: `Read the complete callback, its boundary context, and every consumer of recovered values. Replace the onError callback with an Errored boundary wrapping the guarded JSX. The Errored fallback receives an error accessor — update any error.message or error.toString() access accordingly.`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      });
    });
}

export function analyzeCatchError(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "catchError")
    .filter(
      ({ argumentNodes }) =>
        argumentNodes.length >= 1 &&
        !argumentNodes.some((argument) => argument.kind() === "spread_element"),
    )
    .map(({ call, filename }) => {
      const start = call.range().start;
      return finding(filename, start, {
        severity: "build",
        headline: `Migrate this catchError callback to an Errored boundary.`,
        why: `Solid 2 removes catchError; error handling uses Errored components whose fallback receives an error accessor rather than a raw error value.`,
        guidance: `Read the complete callback and its boundary context. Replace the catchError callback with an Errored boundary. The Errored fallback receives an error accessor — update any error.message access.`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      });
    });
}

export function analyzeResetErrorBoundaries(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return findImportedCalls(rootNode, ["solid-js", "solid-js/web"], "resetErrorBoundaries")
    .filter(({ argumentNodes }) => argumentNodes.length === 0)
    .map(({ call, filename }) => {
      const start = call.range().start;
      return finding(filename, start, {
        severity: "build",
        headline: `Remove this resetErrorBoundaries call.`,
        why: `Solid 2 removes resetErrorBoundaries; Errored boundaries heal automatically on re-render.`,
        guidance: `Remove this call. In Solid 2, Errored boundaries reset their error state whenever their children re-render without throwing — no explicit reset is needed.`,
        lint: ["removed-api"],
        guide: MIGRATION_GUIDE,
      });
    });
}
