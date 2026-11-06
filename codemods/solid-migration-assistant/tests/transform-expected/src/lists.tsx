// Index rewrites: the import is renamed and every element gains keyed={false}.
import { createSignal, For } from "solid-js";

const [items] = createSignal(["a", "b"]);

export function Lists() {
  return (
    <ul>
      <For keyed={false} each={items()} fallback={<li>empty</li>}>
        {(item, index) => (
          <li data-index={index}>
            {item()}
            <For keyed={false} each={items()}>{(cell) => <b>{cell()}</b>}</For>
          </li>
        )}
      </For>
      <For keyed={false} each={items()} />
    </ul>
  );
}
