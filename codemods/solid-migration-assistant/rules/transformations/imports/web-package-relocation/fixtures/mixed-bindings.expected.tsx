// fixture: mixed-bindings
import { render, Portal } from "solid-js/web";
import { Portal as PortalAliased, hydrate as hydrateAliased } from "solid-js/web";
import { isServer, isDev } from "solid-js/web";
import { type Dynamic as DynamicMixed, Suspense } from "solid-js/web";
export { Dynamic, createDynamic } from "solid-js/web";
export { render as renderOut, Portal as portalOut } from "solid-js/web";
import { render as mixedWithDynamic, Dynamic as provenDynamic } from "@solidjs/web";
import { render as provenAlone, isServer as provenServer } from "@solidjs/web";
export { hydrate as provenOut, isServer as provenServerOut } from "@solidjs/web";

void render;
void Portal;
void PortalAliased;
void hydrateAliased;
void isServer;
void isDev;
void Suspense;
void mixedWithDynamic;
void provenDynamic;
void provenAlone;
void provenServer;
type _DynamicMixed = DynamicMixed;
