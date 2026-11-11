import {
  /* lifecycle */ onCleanup,
  /* before */ onMount /* after */,
} from "solid\u002djs";
import { onMount as mount } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

onMount(() => {
  document.querySelector("main")?.focus();
});

// prettier-ignore
(onMount /* callee */)(() => {
  document.querySelector("aside")?.focus();
});

onMount(() => {
  const listener = () => console.log("resize");
  window.addEventListener("resize", listener);
  onCleanup(() => window.removeEventListener("resize", listener));
});

onMount(async () => {
  await Promise.resolve();
});

onMount(/* no argument */);
onMount(/* leading */ () => console.log("leading comment"));
onMount(() => console.log("trailing comment") /* trailing */);
// prettier-ignore
(onMount)(/* parenthesized */ () => console.log("parenthesized comment"));

mount(() => console.log("alias"));
Solid.onMount(() => console.log("namespace"));
Other.onMount(() => console.log("other package"));

onMount();
onMount(
  () => console.log("first"),
  () => console.log("second"),
);
declare const callbacks: [() => void];
onMount(...callbacks);

const indirect = onMount;
indirect(() => console.log("indirect"));

function shadowed(onMount: (callback: () => void) => void) {
  onMount(() => console.log("local"));
}

void shadowed;
