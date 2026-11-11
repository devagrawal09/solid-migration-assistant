// fixture: refusals
import { createEffect, createSignal, on, onCleanup, useContext } from "solid-js";

const [count] = createSignal(0);
const [other] = createSignal(1);
declare const external: () => number;
declare const Ctx: Parameters<typeof useContext>[0];

createEffect(on([count, other], ([a, b]) => {
  console.log(a, b);
}));
createEffect(on(external, (value) => {
  console.log(value);
}));
createEffect(on(count, (value, prev, prevResult) => {
  console.log(value, prev, prevResult);
}));
createEffect(on(count, (value) => value * 2));
createEffect(on(count, (value) => {
  return value;
}));
createEffect(on(count, (value) => {
  onCleanup(() => console.log(value));
}));
createEffect(on(count, (value) => {
  console.log(useContext(Ctx), value);
}));
createEffect(on(count, async (value) => {
  await Promise.resolve(value);
}));
createEffect(on(count, (value) => {
  console.log(value);
}), 0);
createEffect(on(count, /* note */ (value) => {
  console.log(value);
}));
createEffect(on((prev: number) => count() + prev, (value) => {
  console.log(value);
}));
