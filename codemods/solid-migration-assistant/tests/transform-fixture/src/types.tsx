/** @jsxImportSource solid-js */
// JSX type relocations plus the mixed statement the transform must refuse.
import type { JSX } from "solid-js";
import type { JSX as Mixed, Component } from "solid-js";

export const element: JSX.Element = <div />;
export const component: Component<{ child: Mixed.Element }> = (props) => <span>{props.child}</span>;
