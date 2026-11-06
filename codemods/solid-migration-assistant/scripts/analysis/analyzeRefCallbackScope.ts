import { analyzeRefCallbackScope } from "../../rules/analysis/jsx/ref-callback-scope/ref-callback-scope.ts";
import { createAnalysisEntrypoint } from "../../shared/entrypoint.ts";

export default createAnalysisEntrypoint(analyzeRefCallbackScope);
