import { /* before */ createEffect /* after */ } from "solid\x2djs";
import { createEffect as effect } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

createEffect(() => {
  document.title = "supported";
});

// prettier-ignore
(createEffect /* callee */)(() => {
  document.title = "parenthesized";
});

createEffect(/* no argument */);
createEffect(/* leading */ () => console.log("leading comment"));
createEffect(() => console.log("trailing comment") /* trailing */);
// prettier-ignore
(createEffect)(/* parenthesized */ () => console.log("parenthesized comment"));

createEffect(
  () => "already split",
  (value) => console.log(value),
);

createEffect(
  (prev) => {
    console.log("changed from", prev, "to", count());
    return count();
  },
  0,
);

createEffect();

declare const callbacks: [() => void];
createEffect(...callbacks);

effect(() => console.log("alias"));
Solid.createEffect(() => console.log("namespace"));
Other.createEffect(() => console.log("other package"));

const indirect = createEffect;
indirect(() => console.log("indirect"));

function shadowed(createEffect: (callback: () => void) => void) {
  createEffect(() => console.log("local"));
}

void shadowed;

// One-argument effects that need restructuring before a split.
createEffect((prev) => {
  console.log("was", prev);
  return count();
});
createEffect(() => {
  const id = setInterval(() => undefined, 1000);
  onCleanup(() => clearInterval(id));
});
createEffect(() => {
  const [local] = createSignal(0);
  console.log(local());
});
createEffect(async () => {
  await Promise.resolve();
});
declare const namedCallback: () => void;
createEffect(namedCallback);
