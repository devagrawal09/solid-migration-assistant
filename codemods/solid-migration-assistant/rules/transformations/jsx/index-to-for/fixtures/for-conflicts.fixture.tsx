// fixture: for-conflicts
import { createSignal, Index } from "solid-js";

const [items] = createSignal(["a", "b"]);

// A local For would collide with the renamed import.
function For(props: { each: string[] }) {
  return <ul>{props.each.length}</ul>;
}

export function List() {
  return (
    <>
      <For each={items()} />
      <Index each={items()}>{(item) => <i>{item()}</i>}</Index>
    </>
  );
}
