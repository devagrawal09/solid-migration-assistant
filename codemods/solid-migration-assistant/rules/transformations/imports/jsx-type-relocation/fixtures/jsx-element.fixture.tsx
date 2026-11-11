// fixture: jsx-element
import type { JSXElement } from "solid-js";
import { createSignal } from "solid-js";

type Slot = { header?: JSXElement; items: JSXElement[]; render: (value: number) => JSXElement };

export function Card(props: { children: JSXElement | string }): JSXElement {
  const [count] = createSignal(0);
  return <div data-count={count()}>{props.children}</div>;
}

export type { Slot };
