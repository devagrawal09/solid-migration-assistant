/** @jsxImportSource solid-js */
// JSX type relocations and a mixed-statement split. JSXElement stays here
// because this file already binds JSX, so the rewrite would collide.
import type { JSX } from "solid-js";
import type { JSX as Mixed, Component } from "solid-js";
import { type JSXElement, createSignal } from "solid-js";

export const element: JSX.Element = <div />;
export const component: Component<{ child: Mixed.Element }> = (props) => <span>{props.child}</span>;

export function Slot(props: { children: JSXElement }): JSXElement {
  const [open] = createSignal(true);
  return <>{open() && props.children}</>;
}
