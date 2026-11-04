import { rewriteLowercaseEventHandlers } from "../../rules/transformations/jsx/lowercase-event-handlers/lowercase-event-handlers.ts";
import { createTransformEntrypoint } from "../../shared/entrypoint.ts";

export default createTransformEntrypoint(rewriteLowercaseEventHandlers);
