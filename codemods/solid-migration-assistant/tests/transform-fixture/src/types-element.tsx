// JSXElement becomes JSX from @solidjs/web, and every type reference to it
// becomes JSX.Element; createSignal stays in solid-js.
import { type JSXElement, createSignal } from "solid-js";

export function Slot(props: { children: JSXElement; fallback?: JSXElement }): JSXElement {
  const [open] = createSignal(true);
  return <>{open() ? props.children : props.fallback}</>;
}
