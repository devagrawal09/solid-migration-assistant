// fixture: caller-typed
// Values whose type the caller decides. solid-zustand's hooks (src/signal.ts
// and src/store.ts at commit c2bc4fb48eb1e258b6f8dd034e328413daeb4ba5, MIT,
// https://github.com/wobsoriano/solid-zustand/blob/c2bc4fb48eb1e258b6f8dd034e328413daeb4ba5/LICENSE)
// pass a selector's result: the signal hook checks for a function first, the
// store hook doesn't.
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

type StoreApi<T> = { getState(): T };

export function useSignalStore<TState extends object, StateSlice>(api: StoreApi<TState>, selector: (state: TState) => StateSlice) {
  const initialValue = selector(api.getState());
  if (typeof initialValue === "function") return initialValue;
  const [signal] = createSignal(initialValue);
  return signal;
}

export function useStore<TState extends object, StateSlice>(api: StoreApi<TState>, selector: (state: TState) => StateSlice) {
  const initialValue = selector(api.getState()) as any;
  const [state] = createStore(initialValue);
  return state;
}

declare function make<T>(): T;

export function createBox<T>(value: T) {
  const [get] = createSignal(value);
  const [typed] = createSignal<T>(undefined as T);
  const [fromCall] = createSignal<T>(make<T>());
  return [get, typed, fromCall];
}

export function fromUnknown(input: unknown, count: number, label: string) {
  const [a] = createSignal(input);
  const [b] = createSignal(count);
  const [c] = createSignal(label);
  const [d] = createSignal<string>(label);
  return [a, b, c, d];
}
