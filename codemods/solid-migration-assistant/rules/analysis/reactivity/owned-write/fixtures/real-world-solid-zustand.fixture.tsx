// fixture: real-world-solid-zustand
// Origin: wobsoriano/solid-zustand, src/signal.ts and src/store.ts at commit
// c2bc4fb48eb1e258b6f8dd034e328413daeb4ba5, reduced to the two hooks, with
// zustand's StoreApi stubbed. License: MIT
// (https://github.com/wobsoriano/solid-zustand/blob/c2bc4fb48eb1e258b6f8dd034e328413daeb4ba5/LICENSE).
import { createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

type StoreApi<T> = { getState(): T; subscribe(listener: (next: T, previous: T) => void): () => void };

export function useSignalStore<TState extends object, StateSlice>(
  api: StoreApi<TState>,
  selector: (state: TState) => StateSlice,
) {
  const initialValue = selector(api.getState());
  if (typeof initialValue === "function") return initialValue;

  const [signal, setSignal] = createSignal(initialValue);

  const unsubscribe = api.subscribe((payload) => {
    const nextStateSlice = selector(payload) as any;
    setSignal(nextStateSlice);
  });

  onCleanup(() => unsubscribe());

  return signal;
}

export function useStore<TState extends object, StateSlice>(api: StoreApi<TState>, selector: (state: TState) => StateSlice) {
  const [state, setState] = createStore(selector(api.getState()) as any);

  const listener = (nextState: TState) => {
    setState(reconcile(selector(nextState)));
  };

  const unsubscribe = api.subscribe(listener);
  onCleanup(() => unsubscribe());
  return state;
}
