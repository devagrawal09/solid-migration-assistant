// fixture: rewrites
import { createSignal, For } from "solid-js";

const [items] = createSignal(["a", "b"]);
const [rows] = createSignal([[1, 2], [3]]);

export function List() {
  return (
    <ul>
      <For keyed={false} each={items()} fallback={<li>empty</li>}>
        {(item, index) => (
          <li data-index={index}>
            {item()}
            <For keyed={false} each={rows()[index]}>{(cell) => <b>{cell()}</b>}</For>
          </li>
        )}
      </For>
      <For keyed={false}
        each={
          // A comment inside the container must survive byte-for-byte.
          items()
        }
      >
        {(item) => <i>{item()}</i>}
      </For>
      <For keyed={false} each={items()} />
    </ul>
  );
}
