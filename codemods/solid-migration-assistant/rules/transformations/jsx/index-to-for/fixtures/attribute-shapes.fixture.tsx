// fixture: attribute-shapes
import { createSignal, Index } from "solid-js";

const [items] = createSignal(["a", "b"]);
const listProps = { each: ["spread"] };
let container!: HTMLUListElement;

export function Shapes() {
  return (
    <ul ref={container}>
      <Index {...listProps}>{(item) => <i>{item()}</i>}</Index>
      <Index each={items()} keyed={false}>{(item) => <i>{item()}</i>}</Index>
      <Index fallback={<li>missing each</li>}>{(item: () => string) => <i>{item()}</i>}</Index>
      <Index each={items()} ref={container}>{(item) => <i>{item()}</i>}</Index>
      <Index each={items()} each={items()}>{(item) => <i>{item()}</i>}</Index>
      <Index each="literal">{(item) => <i>{item()}</i>}</Index>
    </ul>
  );
}
