// fixture: rewrites
import { createSignal, Index } from "solid-js";

const [items] = createSignal(["a", "b"]);
const [rows] = createSignal([[1, 2], [3]]);

export function List() {
  return (
    <ul>
      <Index each={items()} fallback={<li>empty</li>}>
        {(item, index) => (
          <li data-index={index}>
            {item()}
            <Index each={rows()[index]}>{(cell) => <b>{cell()}</b>}</Index>
          </li>
        )}
      </Index>
      <Index
        each={
          // A comment inside the container must survive byte-for-byte.
          items()
        }
      >
        {(item) => <i>{item()}</i>}
      </Index>
      <Index each={items()} />
    </ul>
  );
}
