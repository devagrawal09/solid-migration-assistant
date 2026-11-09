// fixture: no-matches
import { createEffect, createSignal } from "solid-js";

const [count] = createSignal(0);
createEffect(() => count(), (value) => {
  console.log(value);
});
const text = "createEffect(on(count, fn))";
void text;
