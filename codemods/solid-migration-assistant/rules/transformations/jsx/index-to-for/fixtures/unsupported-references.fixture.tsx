// fixture: unsupported-references
import { createSignal, Index } from "solid-js";

const [items] = createSignal(["a", "b"]);

// A value reference to Index means the import cannot simply be renamed.
const ListComponent = Index;

export function List() {
  return <Index each={items()}>{(item) => <i>{item()}</i>}</Index>;
}

void ListComponent;
