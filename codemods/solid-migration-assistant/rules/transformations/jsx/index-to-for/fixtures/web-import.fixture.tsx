// fixture: web-import
import { createSignal } from "solid-js";
import { Index } from "solid-js/web";

const [items] = createSignal(["a", "b"]);

export function FromWeb() {
  return <Index each={items()}>{(item) => <i>{item()}</i>}</Index>;
}
