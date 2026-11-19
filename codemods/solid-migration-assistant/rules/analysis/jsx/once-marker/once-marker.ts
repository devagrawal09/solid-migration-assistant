import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { finding, type RuleFinding } from "../../../../shared/finding.ts";
import { migrationGuide, SOLID_TARGET_VERSION } from "../../../../shared/target.ts";

const MIGRATION_GUIDE = migrationGuide("once-jsx-marker");
const ONCE = /^\/\*\s*@once\s*\*\/$/;

/**
 * Reports `/*@once*\/` markers inside JSX expressions. Solid 1.x's compiler
 * read the expression once; the 2.0.0 compiler ignores the comment, so the
 * expression silently becomes reactive.
 */
export function analyzeOnceMarker(
  rootNode: SgNode<TSX>,
  context: { filename: string },
): RuleFinding[] {
  return rootNode
    .findAll({ rule: { kind: "comment", regex: "@once", inside: { kind: "jsx_expression", stopBy: "end" } } })
    .filter((comment) => ONCE.test(comment.text()) && wrapsExpression(comment))
    .map((comment) =>
      finding(context.filename, comment, {
        severity: "behavior",
        headline: `Remove this /*@once*/ marker; the expression after it is now reactive.`,
        why: `Solid 1.x compiled a /*@once*/ expression as a one-time read. Solid ${SOLID_TARGET_VERSION} ignores the marker, so the value now updates when its signals change.`,
        guidance: `Delete the comment and keep the expression reactive where updates are fine. For an initial value on a DOM input, use the default prop instead (value to defaultValue, checked to defaultChecked); to seed local state, use a writable derived signal, createSignal(() => props.initial). Only where the value must never update and never comes from async data, read it once with untrack in the component body and pass the local; never use untrack just to silence STRICT_READ_UNTRACKED.`,
        guide: MIGRATION_GUIDE,
      }),
    );
}

function wrapsExpression(comment: SgNode<TSX>): boolean {
  return comment.parent()?.children().some((child) => child.isNamed() && child.kind() !== "comment") ?? false;
}
