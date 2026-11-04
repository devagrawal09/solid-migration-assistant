import { analyzeNestedCreateRoot } from "../../rules/analysis/reactivity/nested-create-root/nested-create-root.ts";
import { createAnalysisEntrypoint } from "../../shared/entrypoint.ts";

export default createAnalysisEntrypoint(analyzeNestedCreateRoot);
