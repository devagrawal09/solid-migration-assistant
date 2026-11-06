import { rewriteIndexToFor } from "../../rules/transformations/jsx/index-to-for/index-to-for.ts";
import { createTransformEntrypoint } from "../../shared/entrypoint.ts";

export default createTransformEntrypoint(rewriteIndexToFor);
