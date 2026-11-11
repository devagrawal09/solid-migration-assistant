// fixture: no-matches
/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import type { JSX as HyperJSX } from "@solidjs/h";
import type { JSX as Local } from "./jsx";
// @jsxImportSource solid-js-compat
const text = 'import type { JSX } from "solid-js"';
export const element: JSX.Element = <div />;
export const hyper: HyperJSX.Element = <span />;
export const local: Local.Element = <b />;
void text;
