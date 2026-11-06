import { analyzeDynamicComponent } from "../../rules/analysis/jsx/dynamic-component/dynamic-component.ts";
import { createAnalysisEntrypoint } from "../../shared/entrypoint.ts";

export default createAnalysisEntrypoint(analyzeDynamicComponent);
