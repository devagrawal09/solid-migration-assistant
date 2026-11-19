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

/** Rules return their findings as the file's jssg data; the workflow reads them from the step result. */
export function createAnalysisEntrypoint(ruleId: string, rule: AnalysisRule): Codemod<TSX> {
  return async (root) => {
    const seen = new Set<string>();
    const findings: Finding[] = [];
    for (const found of rule(root.root(), { filename: root.relativeFilename().replaceAll("\\", "/") })) {
      const finding = { rule: ruleId, ...found };
      const key = JSON.stringify(finding);
      if (!seen.has(key)) {
        seen.add(key);
        findings.push(finding);
      }
    }
    return findings.length > 0 ? { edit: null, data: { findings } } : null;
  };
}

/** Transforms return their edit and, as data, the rewrites it made. */
export function createTransformEntrypoint(ruleId: string, rule: TransformRule): Codemod<TSX> {
  return async (root) => {
    const rootNode = root.root();
    const filename = root.relativeFilename().replaceAll("\\", "/");
    const changes = rule(rootNode, filename);
    if (changes.length === 0) return null;

    // An element with a closing tag reports one rewrite for two edits.
    const seen = new Set<string>();
    const rewrites: Rewrite[] = [];
    for (const { report } of changes) {
      const rewrite = { rule: ruleId, ...report };
      const key = JSON.stringify(rewrite);
      if (!seen.has(key)) {
        seen.add(key);
        rewrites.push(rewrite);
      }
    }
    return { edit: rootNode.commitEdits(changes.map(({ edit }) => edit)), data: { rewrites } };
  };
}
