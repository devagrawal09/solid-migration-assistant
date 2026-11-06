// fixture: shadowed-bindings
import { createSignal, Index } from "solid-js";

const [items] = createSignal(["a", "b"]);

export function Scoped(Index: (props: { each: string[]; children: unknown }) => unknown) {
  return <Index each={items()}>{(item: () => string) => <i>{item()}</i>}</Index>;
}

export function List() {
  return <Index each={items()}>{(item) => <i>{item()}</i>}</Index>;
}
