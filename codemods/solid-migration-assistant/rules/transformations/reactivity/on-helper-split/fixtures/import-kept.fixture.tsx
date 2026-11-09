// fixture: import-kept
import { createEffect, createSignal, on } from "solid-js";

const [count] = createSignal(0);

// Rewritten.
createEffect(on(count, (value) => {
  console.log(value);
}));

// Refused (defer option), so the on import must stay.
createEffect(on(count, (value) => {
  console.log(value);
}, { defer: true }));
