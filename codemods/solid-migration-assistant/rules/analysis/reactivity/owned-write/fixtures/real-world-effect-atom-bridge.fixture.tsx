// fixture: real-world-effect-atom-bridge
// Origin: Effect-TS/effect, packages/atom/solid/src/Hooks.ts at commit
// 039e22199d47f4b6cb9d0737ae3d445c9b06aedc, reduced to createAtomAccessor,
// with the registry stubbed. License: MIT
// (https://github.com/Effect-TS/effect/blob/039e22199d47f4b6cb9d0737ae3d445c9b06aedc/LICENSE).
// With immediate: true the registry calls the listener inside the
// computation that subscribes. A bridge created with ownedWrite is skipped.
import { type Accessor, createComputed, createSignal, onCleanup } from "solid-js";

type Registry = { subscribe<A>(atom: A, f: (next: A) => void, options?: { immediate?: boolean }): () => void };

const constImmediate = { immediate: true };

export function createAtomAccessor<A>(registry: Registry, atom: () => A): Accessor<A> {
  const [value, setValue] = createSignal<A>(null as any);
  createComputed(() => {
    onCleanup(registry.subscribe(atom(), (next) => setValue(() => next), constImmediate));
  });
  return value;
}

export function createBridge<A>(registry: Registry, atom: A): Accessor<{ value: A } | undefined> {
  const [value, setValue] = createSignal<{ value: A }>(undefined, { ownedWrite: true });
  onCleanup(registry.subscribe(atom, (next) => setValue({ value: next })));
  return value;
}

export function useCounter() {
  const [count, setCount] = createSignal(0);
  setCount(1);
  return count;
}
