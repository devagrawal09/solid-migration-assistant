// fixture: rewrites
import { createEffect, createMemo, createSignal } from "solid-js";

const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);

createEffect(() => count(), (value, prev) => {
  console.log(value, prev);
});
createEffect(() => doubled(), (value) => {
  // A comment inside the callback must survive byte-for-byte.
  console.log(value);
});
createEffect(() => count() + 1, function (value) {
  console.log(value);
});

void setCount;
