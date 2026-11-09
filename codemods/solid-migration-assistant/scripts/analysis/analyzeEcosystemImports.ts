import { analyzeEcosystemImports } from "../../rules/analysis/imports/ecosystem-apis/ecosystem-apis.ts";
import { createAnalysisEntrypoint } from "../../shared/entrypoint.ts";

export default createAnalysisEntrypoint(analyzeEcosystemImports);
