// fixture: separate-for-import
import { For } from "solid-js";
import { Index } from "solid-js";

const items = ["a", "b"];

export function Lists() {
  return (
    <>
      <For each={items}>{(item) => <b>{item}</b>}</For>
      <Index each={items}>{(item) => <i>{item()}</i>}</Index>
    </>
  );
}
