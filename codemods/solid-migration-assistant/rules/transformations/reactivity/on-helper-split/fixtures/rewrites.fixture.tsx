// fixture: rewrites
import { createEffect, createMemo, createSignal, on } from "solid-js";

const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);

createEffect(on(count, (value, prev) => {
  console.log(value, prev);
}));
createEffect(on(doubled, (value) => {
  // A comment inside the callback must survive byte-for-byte.
  console.log(value);
}));
createEffect(on(() => count() + 1, function (value) {
  console.log(value);
}));

void setCount;
