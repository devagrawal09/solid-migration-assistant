// fixture: for-imported-after
import { createSignal, For } from "solid-js";

const [items] = createSignal(["a", "b"]);

export function Lists() {
  return (
    <>
      <For keyed={false} each={items()}>{(item) => <i>{item()}</i>}</For>
      <For each={items()}>{(item) => <b>{item}</b>}</For>
    </>
  );
}
