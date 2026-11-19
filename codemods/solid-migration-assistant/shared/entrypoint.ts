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
 * Drops entries whose JSON form repeats (an element with a closing tag
 * reports one rewrite for two edits), so the report lists each once.
 */
function unique<T>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const serialized = JSON.stringify(entry);
    if (seen.has(serialized)) return false;
    seen.add(serialized);
    return true;
  });
}

/** Rules return their findings as the file's jssg data; the workflow reads them from the step result. */
export function createAnalysisEntrypoint(ruleId: string, rule: AnalysisRule): Codemod<TSX> {
  return async (root) => {
    const findings: Finding[] = unique(rule(root.root(), {
      filename: root.relativeFilename().replaceAll("\\", "/"),
    }).map((found) => ({ rule: ruleId, ...found })));
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

    const rewrites: Rewrite[] = unique(changes.map(({ report }) => ({ rule: ruleId, ...report })));
    return { edit: rootNode.commitEdits(changes.map(({ edit }) => edit)), data: { rewrites } };
  };
}
