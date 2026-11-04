// fixture: dynamic-bindings
// Dynamic is exported by @solidjs/web at the pinned rc.21 commit and keeps its
// 1.9 user-facing contract, so it relocates; every report line that carries it
// also records that <Dynamic> is deprecated in favor of dynamic().
import { Dynamic } from "solid-js/web";
import { Dynamic as DynamicAliased } from "solid-js/web";
import { Dynamic as DynamicWithRender, render as renderWithDynamic } from "solid-js/web";
export { Dynamic as DynamicOut } from "solid-js/web";
export { Dynamic as DynamicWithProven, isServer as isServerWithDynamic } from "solid-js/web";
import { Dynamic as DynamicWithPortal, Portal } from "solid-js/web";

void Dynamic;
void DynamicAliased;
void DynamicWithRender;
void renderWithDynamic;
void DynamicWithPortal;
void Portal;
