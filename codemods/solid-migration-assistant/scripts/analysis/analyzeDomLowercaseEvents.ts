import { analyzeDomLowercaseEvents } from "../../rules/analysis/jsx/dom-lowercase-events/dom-lowercase-events.ts";
import { createAnalysisEntrypoint } from "../../shared/entrypoint.ts";

export default createAnalysisEntrypoint(analyzeDomLowercaseEvents);
