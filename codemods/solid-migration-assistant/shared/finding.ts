import type { SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import type { SeverityId as Severity } from "./format.mjs";

export type { Severity };

/**
 * One analyzer finding, as data. Rules build findings; only the edges
 * (`scripts/emit-report.ts` and the launcher, both through
 * `shared/format.mjs`) turn them into text, JSON, or agent Markdown.
 */
export type Finding = {
  /** The rule folder that produced it, `<domain>/<rule>`. */
  rule: string;
  file: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  /** Fix order: what will not build, then silent behavior changes, then deprecations. */
  severity: Severity;
  /** One sentence naming the site and the change, ending with a period. */
  headline: string;
  /** Why the Solid 1 code is wrong or different on the Solid 2 target. */
  why: string;
  /** What to read, what to change, and when to stop and ask instead. */
  guidance: string;
  /** eslint-plugin-solid rules (v2 config) that keep reporting the site. */
  lint: string[];
  /** The migration guide (or package documentation) section for the change. */
  guide: string;
};

/** A finding as a rule returns it; the entrypoint adds the rule id. */
export type RuleFinding = Omit<Finding, "rule">;

/** One applied rewrite, as data. */
export type Rewrite = {
  rule: string;
  file: string;
  line: number;
  column: number;
  message: string;
  guide: string;
};

/** A rewrite as a rule returns it; the entrypoint adds the rule id. */
export type RuleRewrite = Omit<Rewrite, "rule">;

/** Where a finding or rewrite points: a node's start, or an ast-grep (0-based) position. */
export type Site = SgNode<TSX> | { line: number; column: number };

/** A finding at `at` in `file`. */
export function finding(
  file: string,
  at: Site,
  fields: Omit<RuleFinding, "file" | "line" | "column" | "lint"> & { lint?: string[] },
): RuleFinding {
  return { file, ...position(at), ...fields, lint: fields.lint ?? [] };
}

/** A rewrite report at `at` in `file`. */
export function rewrite(file: string, at: Site, message: string, guide: string): RuleRewrite {
  return { file, ...position(at), message, guide };
}

function position(at: Site): { line: number; column: number } {
  const start = "range" in at ? at.range().start : at;
  return { line: start.line + 1, column: start.column + 1 };
}
