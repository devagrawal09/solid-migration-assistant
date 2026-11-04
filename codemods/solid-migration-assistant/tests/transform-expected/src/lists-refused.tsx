// A single unsupported Index site keeps the whole file byte-identical.
import { createSignal, Index } from "solid-js";

const [items] = createSignal(["a", "b"]);
const listProps = { each: ["spread"] };

export function Lists() {
  return (
    <ul>
      <Index each={items()}>{(item) => <li>{item()}</li>}</Index>
      <Index {...listProps}>{(item) => <li>{item()}</li>}</Index>
    </ul>
  );
}
