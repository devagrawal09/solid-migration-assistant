import type { Codemod, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import type { Finding, Rewrite, RuleFinding } from "./finding.ts";
import type { TransformChange } from "./transform.ts";

type AnalysisRule = (
  rootNode: SgNode<TSX>,
  context: { filename: string },
) => RuleFinding[];

type TransformRule = (
  rootNode: SgNode<TSX>,
  filename: string,
) => TransformChange[];

/**
 * A finding as one row of a transform's returned data. Data labels are
 * strings, numbers or booleans, so `lint` travels joined; the workflow
 * turns rows back into findings (`findingsFromData`).
 */
export type FindingRow = Omit<Finding, "lint"> & { lint: string };

export function createAnalysisEntrypoint(ruleId: string, rule: AnalysisRule): Codemod<TSX> {
  return async (root) => {
    const findings: FindingRow[] = rule(root.root(), {
      filename: root.relativeFilename().replaceAll("\\", "/"),
    }).map((found) => ({ rule: ruleId, ...found, lint: found.lint.join(",") }));
    return { edit: null, data: { findings } };
  };
}

export function createTransformEntrypoint(ruleId: string, rule: TransformRule): Codemod<TSX> {
  return async (root) => {
    const rootNode = root.root();
    const filename = root.relativeFilename().replaceAll("\\", "/");
    const changes = rule(rootNode, filename);
    if (changes.length === 0) return null;

    const rewrites: Rewrite[] = changes.map(({ report }) => ({ rule: ruleId, ...report }));
    return { edit: rootNode.commitEdits(changes.map(({ edit }) => edit)), data: { rewrites } };
  };
}
