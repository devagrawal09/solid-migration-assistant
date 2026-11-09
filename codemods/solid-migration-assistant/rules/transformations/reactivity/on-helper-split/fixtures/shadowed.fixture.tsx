// fixture: shadowed
import { createEffect, createSignal, on } from "solid-js";
import { on as listen } from "./events";

const [count] = createSignal(0);

export function local(on: (...args: unknown[]) => () => void) {
  createEffect(on(count, (value: number) => {
    console.log(value);
  }));
}

void listen;
