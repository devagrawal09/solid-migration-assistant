import { parse, type Codemod, type SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { ANALYSIS_RULES, TRANSFORM_RULES } from "./rules.generated.ts";

/**
 * Runs every rule against its own fixtures in one `codemod jssg run` over
 * `rules/` (driven by `tests/rule-fixtures.test.mjs`) and prints one
 * `SMA-FIXTURE <json>` line per fixture with what the rule produced. It never
 * returns an edit, so no fixture is written.
 *
 * A transform rule is applied the way the workflow applies it: each of its
 * steps runs on the text the previous step produced. Its output is then fed
 * back through every step once more, and whatever that second pass would
 * still rewrite is reported as `unsettled`, which must be empty.
 */
const FIXTURE = /^(analysis|transformations)\/([^/]+\/[^/]+)\/fixtures\/[^/]+\.fixture\.tsx$/;

type Rewrites = ReadonlyArray<{ report: unknown; edit: Parameters<SgNode<TSX>["commitEdits"]>[0][number] }>;
type TransformStep = (rootNode: SgNode<TSX>, filename: string) => Rewrites;
type AnalysisStep = (rootNode: SgNode<TSX>, context: { filename: string }) => object[];

const runner: Codemod<TSX> = async (root) => {
  const fixture = root.relativeFilename().replaceAll("\\", "/");
  const match = FIXTURE.exec(fixture);
  if (match === null) return null;
  const [, kind, rule] = match as unknown as [string, string, string];

  if (kind === "analysis") {
    const steps = (ANALYSIS_RULES as Record<string, AnalysisStep[]>)[rule] ?? [];
    const findings = steps.flatMap((step) =>
      step(root.root(), { filename: fixture }).map((found) => ({ rule, ...found })),
    );
    emit({ fixture, rule, findings });
    return null;
  }

  const steps = (TRANSFORM_RULES as Record<string, TransformStep[]>)[rule] ?? [];
  const first = applySteps(steps, root.root(), fixture);
  const second = applySteps(steps, parse<TSX>("tsx", first.text).root(), fixture);
  emit({
    fixture,
    rule,
    rewrites: first.rewrites.map((rewrite) => ({ rule, ...(rewrite as object) })),
    output: first.text === root.root().text() ? null : first.text,
    unsettled: second.rewrites,
  });
  return null;
};

function applySteps(steps: TransformStep[], rootNode: SgNode<TSX>, filename: string) {
  const rewrites: unknown[] = [];
  const seen = new Set<string>();
  let current = rootNode;
  for (const step of steps) {
    const changes = step(current, filename);
    for (const { report } of changes) {
      const key = JSON.stringify(report);
      if (!seen.has(key)) {
        seen.add(key);
        rewrites.push(report);
      }
    }
    if (changes.length > 0) {
      current = parse<TSX>("tsx", current.commitEdits(changes.map(({ edit }) => edit))).root();
    }
  }
  return { rewrites, text: current.text() };
}

function emit(result: object): void {
  console.log(`SMA-FIXTURE ${JSON.stringify(result)}`);
}

export default runner;
