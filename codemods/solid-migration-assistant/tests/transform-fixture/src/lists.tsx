// Index rewrites: the import is renamed and every element gains keyed={false}.
import { createSignal, Index } from "solid-js";

const [items] = createSignal(["a", "b"]);

export function Lists() {
  return (
    <ul>
      <Index each={items()} fallback={<li>empty</li>}>
        {(item, index) => (
          <li data-index={index}>
            {item()}
            <Index each={items()}>{(cell) => <b>{cell()}</b>}</Index>
          </li>
        )}
      </Index>
      <Index each={items()} />
    </ul>
  );
}
