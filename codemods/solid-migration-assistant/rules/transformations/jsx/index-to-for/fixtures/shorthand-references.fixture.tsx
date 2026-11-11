// fixture: shorthand-references
import { createSignal, Index } from "solid-js";

const [items] = createSignal(["a", "b"]);

// A shorthand object property references the import by name, so renaming the
// import would leave it dangling.
export const components = { Index };

export function List() {
  return <Index each={items()}>{(item) => <i>{item()}</i>}</Index>;
}
