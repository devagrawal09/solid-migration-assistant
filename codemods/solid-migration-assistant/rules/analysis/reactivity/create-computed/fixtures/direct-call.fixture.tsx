import {
  /* before */ createComputed /* after */,
  createSignal,
} from "solid\u{000002d}js";
import { createComputed as computed } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

const [count, setCount] = createSignal(0);

createComputed(() => count() * 2);
createComputed(() => console.log(count()));
createComputed(() => setCount(count() + 1));
createComputed(() => {
  console.log(count());
  setCount(count() + 1);
});
// prettier-ignore
(createComputed /* callee */)(/* leading */ () => count());
createComputed((previous = 0) => previous + count(), 0);
createComputed((previous = 0) => previous + count(), 0, { name: "legacy" });
createComputed();
createComputed(() => count(), 0, { name: "legacy" }, "extra");
declare const computedCallbacks: [() => number];
createComputed(...computedCallbacks);

computed(() => count());
Solid.createComputed(() => count());
Other.createComputed(() => count());

const indirect = createComputed;
indirect(() => count());

function shadowed(createComputed: (callback: () => number) => void) {
  createComputed(() => count());
}

void shadowed;
