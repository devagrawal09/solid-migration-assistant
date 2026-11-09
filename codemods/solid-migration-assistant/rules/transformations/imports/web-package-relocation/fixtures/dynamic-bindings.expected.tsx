// fixture: dynamic-bindings
// Dynamic is exported by @solidjs/web at the pinned rc.21 commit and keeps its
// 1.9 user-facing contract, so it relocates; every report line that carries it
// also records that <Dynamic> is deprecated in favor of dynamic().
import { Dynamic } from "@solidjs/web";
import { Dynamic as DynamicAliased } from "@solidjs/web";
import { Dynamic as DynamicWithRender, render as renderWithDynamic } from "@solidjs/web";
export { Dynamic as DynamicOut } from "@solidjs/web";
export { Dynamic as DynamicWithProven, isServer as isServerWithDynamic } from "@solidjs/web";
import { Dynamic as DynamicWithPortal, Portal } from "solid-js/web";

void Dynamic;
void DynamicAliased;
void DynamicWithRender;
void renderWithDynamic;
void DynamicWithPortal;
void Portal;
