// fixture: for-imported-before
import { For, Index, createSignal } from "solid-js";

const [items] = createSignal(["a", "b"]);

export function Lists() {
  return (
    <>
      <For each={items()}>{(item) => <b>{item}</b>}</For>
      <Index each={items()}>{(item) => <i>{item()}</i>}</Index>
    </>
  );
}
