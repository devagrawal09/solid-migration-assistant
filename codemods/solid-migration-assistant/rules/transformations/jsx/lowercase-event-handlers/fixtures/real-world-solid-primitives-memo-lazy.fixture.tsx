// fixture: real-world-solid-primitives-memo-lazy
// Origin: solidjs-community/solid-primitives, packages/memo/dev/lazy.tsx at
// commit 9c81cd0d64591e80afafd30e9facf7dccfb0f4ab, reduced to the toggle
// buttons of the dev component. License: MIT
// (https://github.com/solidjs-community/solid-primitives/blob/9c81cd0d64591e80afafd30e9facf7dccfb0f4ab/LICENSE).
import { createSignal } from "solid-js";

export default function App() {
  const [showComp, setShowComp] = createSignal(true);
  const [showEffect, setShowEffect] = createSignal(true);
  const [count, setCount] = createSignal(0);

  return (
    <>
      <button class="btn" onclick={() => setShowComp(p => !p)}>
        component: {showComp() ? "ON" : "OFF"}
      </button>
      <button class="btn" onclick={() => setShowEffect(p => !p)}>
        effect: {showEffect() ? "ON" : "OFF"}
      </button>
      <button class="btn" onclick={() => setCount(p => p + 1)}>
        increase
      </button>
      <p>count: {count()};</p>
    </>
  );
}
