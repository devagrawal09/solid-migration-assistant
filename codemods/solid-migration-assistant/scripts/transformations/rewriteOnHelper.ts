import { rewriteOnHelper } from "../../rules/transformations/reactivity/on-helper-split/on-helper-split.ts";
import { createTransformEntrypoint } from "../../shared/entrypoint.ts";

export default createTransformEntrypoint(rewriteOnHelper);
