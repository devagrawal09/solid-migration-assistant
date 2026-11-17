// fixture: split-refusals
import type { /* keep */ JSX, Component } from "solid-js";
import { createSignal } from "solid-js";
import type { JSX as ValueJSX } from "@solidjs/web";
import type { JSXElement as Element, Accessor } from "solid-js";
import { JSXElement, createMemo } from "solid-js";

export const element: JSX.Element = <div />;
export const component: Component = () => <span />;
export const value: ValueJSX.Element = <b />;
export const legacy: Element = <i />;
export const accessor: Accessor<number> = () => 1;
export const plain: JSXElement = <u />;
void createSignal;
void createMemo;
