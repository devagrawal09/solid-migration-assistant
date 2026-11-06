import { rewriteContextProvider } from "../../rules/transformations/jsx/context-provider-to-context/context-provider-to-context.ts";
import { createTransformEntrypoint } from "../../shared/entrypoint.ts";

export default createTransformEntrypoint(rewriteContextProvider);
