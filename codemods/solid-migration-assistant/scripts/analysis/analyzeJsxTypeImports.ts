import { analyzeJsxTypeImports } from "../../rules/analysis/imports/jsx-types/jsx-types.ts";
import { createAnalysisEntrypoint } from "../../shared/entrypoint.ts";

export default createAnalysisEntrypoint(analyzeJsxTypeImports);
