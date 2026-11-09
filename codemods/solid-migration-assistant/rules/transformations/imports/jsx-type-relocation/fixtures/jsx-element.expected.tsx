// fixture: jsx-element
import type { JSX } from "@solidjs/web";
import { createSignal } from "solid-js";

type Slot = { header?: JSX.Element; items: JSX.Element[]; render: (value: number) => JSX.Element };

export function Card(props: { children: JSX.Element | string }): JSX.Element {
  const [count] = createSignal(0);
  return <div data-count={count()}>{props.children}</div>;
}

export type { Slot };
