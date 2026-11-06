import type { Edit, SgRoot } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

/**
 * One colocated fixture of a transform rule: the report lines the rule must
 * emit (location plus message, without the guide link), the exact
 * post-transform text (or null when the file must stay byte-identical), and
 * substrings the fixture must contain, proving the case it claims to cover.
 */
export type TransformFixtureCase = {
  reports: ReadonlyArray<string>;
  transformed: string | null;
  evidence: ReadonlyArray<readonly [string, string]>;
};

export type TransformRule = (
  rootNode: ReturnType<SgRoot<TSX>["root"]>,
  filename: string,
) => ReadonlyArray<{ edit: Edit; report: string }>;

/**
 * Runs a transform rule against the fixture identified by its
 * `// fixture: <name>` marker and throws on the first mismatch. Several edits
 * may share one report line (an opening and closing tag, or an import and
 * its elements); the workflow deduplicates them exactly, so reports are
 * compared as a unique list. `settledError` receives the transformed text of a
 * positive fixture and returns a message when a second run would still find
 * something to rewrite. This harness is test-only and is not published.
 */
export function runTransformFixtureCase(
  root: SgRoot<TSX>,
  options: {
    rule: TransformRule;
    guide: string;
    cases: Readonly<Record<string, TransformFixtureCase>>;
    settledError?: (
      transformed: string,
      marker: string,
      reports: ReadonlyArray<string>,
    ) => string | null;
  },
): void {
  const rootNode = root.root();
  const filename = root.relativeFilename().replaceAll("\\", "/");
  const source = root.source();
  const marker = /\/\/ fixture: ([a-z0-9-]+)/.exec(source)?.[1];
  if (!marker) {
    throw new Error(
      "fixture is missing a `// fixture: <name>` marker on its first line",
    );
  }

  const fixtureCase = options.cases[marker];
  if (!fixtureCase) {
    throw new Error(`unknown fixture marker: ${marker}`);
  }

  for (const [label, text] of fixtureCase.evidence) {
    if (!source.includes(text)) {
      throw new Error(`fixture ${marker} must prove the ${label} case`);
    }
  }

  const rewrites = options.rule(rootNode, filename);

  const expected = fixtureCase.reports.map(
    (report) => `${filename}:${report} Official migration guide: ${options.guide}`,
  );
  const actual = [...new Set(rewrites.map(({ report }) => report))];
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(
      `unexpected rewrite report for ${marker}:\n${actual.join("\n")}\nExpected:\n${expected.join("\n")}`,
    );
  }

  const transformed = rootNode.commitEdits(rewrites.map(({ edit }) => edit));
  const expectedTransformed = fixtureCase.transformed ?? source;
  if (transformed !== expectedTransformed) {
    throw new Error(
      `unexpected transformed output for ${marker}:\n${transformed}\nExpected:\n${expectedTransformed}`,
    );
  }

  if (fixtureCase.transformed !== null && options.settledError) {
    const message = options.settledError(transformed, marker, actual);
    if (message !== null) throw new Error(`${marker}: ${message}`);
  }
}
