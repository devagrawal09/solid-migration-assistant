import { relocateJsxTypes } from "../../rules/transformations/imports/jsx-type-relocation/jsx-type-relocation.ts";
import { createTransformEntrypoint } from "../../shared/entrypoint.ts";

export default createTransformEntrypoint(relocateJsxTypes);
