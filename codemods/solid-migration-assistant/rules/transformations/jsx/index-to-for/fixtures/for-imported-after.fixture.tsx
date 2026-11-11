// fixture: for-imported-after
import { createSignal, Index, For } from "solid-js";

const [items] = createSignal(["a", "b"]);

export function Lists() {
  return (
    <>
      <Index each={items()}>{(item) => <i>{item()}</i>}</Index>
      <For each={items()}>{(item) => <b>{item}</b>}</For>
    </>
  );
}
