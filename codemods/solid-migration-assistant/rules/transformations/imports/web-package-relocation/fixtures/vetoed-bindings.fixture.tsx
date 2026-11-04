// fixture: vetoed-bindings
import { Portal } from "solid-js/web";
import { isDev } from "solid-js/web";
import { createDynamic } from "solid-js/web";
import { Suspense, ErrorBoundary } from "solid-js/web";
import { renderToString, renderToStream } from "solid-js/web";
import { renderToStringAsync, pipeToNodeWritable } from "solid-js/web";
import { generateHydrationScript, HydrationScript } from "solid-js/web";
import { getRequestEvent } from "solid-js/web";
import { For, Show, Switch, Match } from "solid-js/web";
import { Index, SuspenseList, mergeProps } from "solid-js/web";
import { NoHydration, Hydration } from "solid-js/web";
import { template, insert, spread, delegateEvents } from "solid-js/web";
import { ssr, ssrClassList, ssrHydrationKey } from "solid-js/web";
import type { DynamicProps } from "solid-js/web";
// DynamicProps is a type whose `component` shape widened in 2.0, so it is not
// proven and vetoes the statement; Dynamic itself is proven at rc.21 and is
// covered by the dynamic-bindings fixture.
import { Dynamic as DynamicWithProps, type DynamicProps as DynamicPropsMixed } from "solid-js/web";
export { Portal as PortalOut } from "solid-js/web";
export type { DynamicProps as DynamicPropsOut } from "solid-js/web";

void Portal;
void isDev;
void createDynamic;
void Suspense;
void ErrorBoundary;
void renderToString;
void renderToStream;
void renderToStringAsync;
void pipeToNodeWritable;
void generateHydrationScript;
void HydrationScript;
void getRequestEvent;
void For;
void Show;
void Switch;
void Match;
void Index;
void SuspenseList;
void mergeProps;
void NoHydration;
void Hydration;
void template;
void insert;
void spread;
void delegateEvents;
void ssr;
void ssrClassList;
void ssrHydrationKey;
void DynamicWithProps;
type _DynamicProps = DynamicProps;
type _DynamicPropsMixed = DynamicPropsMixed;
