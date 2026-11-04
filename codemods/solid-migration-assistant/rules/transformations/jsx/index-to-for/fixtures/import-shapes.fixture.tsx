// fixture: import-shapes
import { Index as List } from "solid-js";
import { createSignal } from "solid-js";

const [items] = createSignal(["a", "b"]);

export function Aliased() {
  return <List each={items()}>{(item) => <i>{item()}</i>}</List>;
}
