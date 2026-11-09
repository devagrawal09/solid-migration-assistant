/** @jsxImportSource solid-js */
import type { JSX, JSXElement } from "solid-js";
import { type JSX as J, createSignal } from "solid-js";
import type { JSX as WebJSX } from "@solidjs/web";

export const element: JSX.Element = <div />;
export const legacy: JSXElement = <span />;
export const aliased: J.Element = <b />;
export const web: WebJSX.Element = <i />;
void createSignal;
