// fixture: rewrites
import { createSignal } from "solid-js";

const [count, setCount] = createSignal(0);
const increment = () => setCount(count() + 1);

export function View() {
  return (
    <section>
      <button onClick={increment}>{count()}</button>
      <input onInput={(event) => setCount(event.currentTarget.value.length)} />
      <div onDblClick={() => undefined} onPointerDown={increment} onKeyDown={[increment, 1]} />
      <my-element onFocusIn={() => undefined} />
      <textarea
        onChange={
          // A comment inside the container must survive byte-for-byte.
          increment
        }
        rows="3"
      />
      <svg>
        <rect onMouseEnter={increment} on:custom={increment} />
      </svg>
      <a href="#" onClick={increment} onClick:unrelated="x" />
    </section>
  );
}
