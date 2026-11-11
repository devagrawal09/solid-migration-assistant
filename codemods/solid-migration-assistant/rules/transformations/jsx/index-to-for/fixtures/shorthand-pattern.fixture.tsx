// fixture: shorthand-pattern
import { createSignal, Index } from "solid-js";

const [items] = createSignal(["a", "b"]);
const List = { Index: (props: { each: string[]; children: unknown }) => props };

// A shorthand destructuring pattern shadows Index with a local component.
export function Local() {
  const { Index } = List;
  return <Index each={items()}>{(item: () => string) => <i>{item()}</i>}</Index>;
}

export function Imported() {
  return <Index each={items()}>{(item) => <i>{item()}</i>}</Index>;
}
