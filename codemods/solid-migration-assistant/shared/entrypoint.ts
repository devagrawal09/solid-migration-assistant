import type { Codemod, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { acquireLock, getState, setState } from "codemod:workflow";
import { ANALYSIS_STATE_KEY } from "./analysis.ts";
import type { Finding, Rewrite, RuleFinding } from "./finding.ts";
import { TRANSFORM_REPORT_STATE_KEY, type TransformChange } from "./transform.ts";

type AnalysisRule = (
  rootNode: SgNode<TSX>,
  context: { filename: string },
) => RuleFinding[];

type TransformRule = (
  rootNode: SgNode<TSX>,
  filename: string,
) => TransformChange[];

/**
 * Accumulates entries under one workflow state key, deduplicated by their
 * JSON form (an element with a closing tag reports one rewrite for two
 * edits), so the emitter sees each finding or rewrite exactly once.
 */
function accumulate<T>(key: string, entries: T[]): void {
  const release = acquireLock(key);
  try {
    const accumulated = getState<T[]>(key) ?? [];
    const seen = new Set(accumulated.map((entry) => JSON.stringify(entry)));
    const added = entries.filter((entry) => {
      const serialized = JSON.stringify(entry);
      if (seen.has(serialized)) return false;
      seen.add(serialized);
      return true;
    });
    setState(key, [...accumulated, ...added]);
  } finally {
    release();
  }
}

export function createAnalysisEntrypoint(ruleId: string, rule: AnalysisRule): Codemod<TSX> {
  return async (root) => {
    const findings: Finding[] = rule(root.root(), {
      filename: root.relativeFilename().replaceAll("\\", "/"),
    }).map((found) => ({ rule: ruleId, ...found }));
    if (findings.length > 0) accumulate(ANALYSIS_STATE_KEY, findings);
    return null;
  };
}

export function createTransformEntrypoint(ruleId: string, rule: TransformRule): Codemod<TSX> {
  return async (root) => {
    const rootNode = root.root();
    const filename = root.relativeFilename().replaceAll("\\", "/");
    const changes = rule(rootNode, filename);
    if (changes.length === 0) return null;

    const rewrites: Rewrite[] = changes.map(({ report }) => ({ rule: ruleId, ...report }));
    accumulate(TRANSFORM_REPORT_STATE_KEY, rewrites);
    return rootNode.commitEdits(changes.map(({ edit }) => edit));
  };
}
