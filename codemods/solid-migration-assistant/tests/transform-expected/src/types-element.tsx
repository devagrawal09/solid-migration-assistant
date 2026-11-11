// JSXElement becomes JSX from @solidjs/web, and every type reference to it
// becomes JSX.Element; createSignal stays in solid-js.
import { createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

export function Slot(props: { children: JSX.Element; fallback?: JSX.Element }): JSX.Element {
  const [open] = createSignal(true);
  return <>{open() ? props.children : props.fallback}</>;
}
