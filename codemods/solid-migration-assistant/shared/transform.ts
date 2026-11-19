import type { Edit } from "codemod:ast-grep";
import type { RuleRewrite } from "./finding.ts";

/** One rule-owned edit plus the rewrite it reports. */
export type TransformChange = {
  edit: Edit;
  report: RuleRewrite;
};
