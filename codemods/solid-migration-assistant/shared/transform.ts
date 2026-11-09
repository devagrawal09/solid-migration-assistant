import type { Edit } from "codemod:ast-grep";
import type { RuleRewrite } from "./finding.ts";

/**
 * Workflow-level report state key for the transform workflow. Transform
 * rules live under rules/transformations/ and report through this shared
 * key; this module intentionally holds no rule logic.
 */
export const TRANSFORM_REPORT_STATE_KEY =
  "solid-migration-assistant-transform-report";

/** One rule-owned edit plus the rewrite it reports. */
export type TransformChange = {
  edit: Edit;
  report: RuleRewrite;
};
