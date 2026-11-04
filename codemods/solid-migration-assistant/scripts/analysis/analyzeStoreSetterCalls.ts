import { analyzeStoreSetterCalls } from "../../rules/analysis/store/setter-calls/setter-calls.ts";
import { createAnalysisEntrypoint } from "../../shared/entrypoint.ts";

export default createAnalysisEntrypoint(analyzeStoreSetterCalls);
