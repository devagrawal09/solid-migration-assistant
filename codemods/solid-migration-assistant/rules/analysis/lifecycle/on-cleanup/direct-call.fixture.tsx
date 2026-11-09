import { createEffect, createRoot, onCleanup, onMount } from "solid-js";
import { onCleanup as cleanup } from "solid-js";
import * as Solid from "solid-js";

// Reported: the one-argument effect becomes a split effect whose apply
// callback returns its cleanup.
createEffect(() => {
  const id = setInterval(() => console.log("tick"), 1000);
  onCleanup(() => clearInterval(id));
});

// Reported: onMount becomes onSettled, which takes a returned cleanup.
onMount(() => {
  window.addEventListener("resize", onResize);
  onCleanup(() => window.removeEventListener("resize", onResize));
});

// Reported through an alias and a namespace import.
createEffect(() => {
  cleanup(() => console.log("alias"));
  Solid.onCleanup(() => console.log("namespace"));
});

// Silent: still valid in a component body, a custom hook, and createRoot.
export function Timer() {
  const id = setInterval(() => undefined, 1000);
  onCleanup(() => clearInterval(id));
  return <span />;
}

export function useListener(target: EventTarget) {
  target.addEventListener("x", onResize);
  onCleanup(() => target.removeEventListener("x", onResize));
}

export const dispose = createRoot((dispose) => {
  onCleanup(() => console.log("root"));
  return dispose;
});

// Silent: a nested function inside the effect runs at another time.
createEffect(() => {
  setTimeout(() => onCleanup(() => undefined), 0);
});

// Silent: a two-argument effect is reported by the createEffect analyzer.
createEffect(() => onCleanup(() => undefined), 0);

// Silent: a shadowed onCleanup is not Solid's.
function shadowed(onCleanup: (callback: () => void) => void) {
  createEffect(() => {
    onCleanup(() => console.log("local"));
  });
}

function onResize() {}
void shadowed;
