// fixture: mixed-statements
import type { JSX, Component } from "solid-js";
import { type JSX as J, createSignal } from "solid-js";
import { JSX as ValueImport } from "solid-js";
import type { JSXElement } from "solid-js";
import type * as Solid from "solid-js";
import type { JSX as Attributed } from "solid-js" with { type: "ts" };

export const element: JSX.Element = <div />;
export const component: Component = () => <span />;
export const j: J.Element = <b />;
export const legacy: JSXElement = <i />;
export const namespace: Solid.JSX.Element = <u />;
export const attributed: Attributed.Element = <s />;
void createSignal;
void ValueImport;
