import { parse, type SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import type { WorkflowFile } from "codemod:workflow";
import type { Finding, Rewrite, RuleFinding } from "./finding.ts";
import type { TransformChange } from "./transform.ts";

type AnalysisRule = (
  rootNode: SgNode<TSX>,
  context: { filename: string },
) => RuleFinding[];

type TransformRule = (
  rootNode: SgNode<TSX>,
  filename: string,
  /** Params for a rule the workflow scopes (none in fixtures). */
  params?: Readonly<Record<string, string>>,
) => TransformChange[];

/** A `forEachFile` callback for one analysis rule: it returns the file's findings, each once. */
export function createAnalysisEntrypoint(ruleId: string, rule: AnalysisRule) {
  return (file: WorkflowFile): Finding[] | undefined => {
    const root = parse<TSX>(file);
    const findings = unique(rule(root.root(), { filename: file.path }).map((found): Finding => ({ rule: ruleId, ...found })));
    return findings.length > 0 ? findings : undefined;
  };
}

/**
 * A `forEachFile` callback for one transform rule: it writes the rewritten
 * file and returns its rewrites, each once (an element with a closing tag
 * reports one rewrite for two edits).
 */
export function createTransformEntrypoint(ruleId: string, rule: TransformRule) {
  return (file: WorkflowFile, params?: Readonly<Record<string, string>>): Rewrite[] | undefined => {
    const rootNode = parse<TSX>(file).root();
    const changes = rule(rootNode, file.path, params);
    if (changes.length === 0) return undefined;
    file.write(rootNode.commitEdits(changes.map(({ edit }) => edit)));
    return unique(changes.map(({ report }): Rewrite => ({ rule: ruleId, ...report })));
  };
}

/** Entries in first-seen order, each JSON form once. */
export function unique<T>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
