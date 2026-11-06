// fixture: type-arguments
import { createSignal, Index } from "solid-js";

const [items] = createSignal(["a", "b"]);

// Explicit type arguments sit between the name and the attributes, so the
// keyed attribute cannot be inserted after the name; the file stays unchanged.
export function Typed() {
  return (
    <>
      <Index<string> each={items()}>{(item) => <i>{item()}</i>}</Index>
      <Index each={items()}>{(item) => <i>{item()}</i>}</Index>
    </>
  );
}
