// fixture: for-imported-before
import { For, createSignal } from "solid-js";

const [items] = createSignal(["a", "b"]);

export function Lists() {
  return (
    <>
      <For each={items()}>{(item) => <b>{item}</b>}</For>
      <For keyed={false} each={items()}>{(item) => <i>{item()}</i>}</For>
    </>
  );
}
