// fixture: rewrites
import { createSignal } from "solid-js";

const [count, setCount] = createSignal(0);
const increment = () => setCount(count() + 1);

export function View() {
  return (
    <section>
      <button onclick={increment}>{count()}</button>
      <input oninput={(event) => setCount(event.currentTarget.value.length)} />
      <div ondblclick={() => undefined} onpointerdown={increment} onkeydown={[increment, 1]} />
      <my-element onfocusin={() => undefined} />
      <textarea
        onchange={
          // A comment inside the container must survive byte-for-byte.
          increment
        }
        rows="3"
      />
      <svg>
        <rect onmouseenter={increment} on:custom={increment} />
      </svg>
      <a href="#" onclick={increment} onClick:unrelated="x" />
    </section>
  );
}
