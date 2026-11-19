// fixture: real-world-solid-zustand-store
// Origin: wobsoriano/solid-zustand, src/store.ts at commit
// c2bc4fb48eb1e258b6f8dd034e328413daeb4ba5, reduced to the store hook, with
// zustand's StoreApi stubbed. License: MIT
// (https://github.com/wobsoriano/solid-zustand/blob/c2bc4fb48eb1e258b6f8dd034e328413daeb4ba5/LICENSE).
// setState(reconcile(slice)) is already valid on Solid 2 and is not reported.
import { onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

type StoreApi<T> = { getState(): T; subscribe(listener: (next: T, previous: T) => void): () => void };

export function useStore<TState extends object, StateSlice>(
  api: StoreApi<TState>,
  selector: (state: TState) => StateSlice,
  equalityFn?: (a: StateSlice, b: StateSlice) => boolean,
) {
  const initialValue = selector(api.getState()) as any;
  const [state, setState] = createStore(initialValue);

  const listener = (nextState: TState, previousState: TState) => {
    const prevStateSlice = selector(previousState);
    const nextStateSlice = selector(nextState);

    if (equalityFn !== undefined) {
      if (!equalityFn(prevStateSlice, nextStateSlice)) setState(reconcile(nextStateSlice));
    } else {
      setState(reconcile(nextStateSlice));
    }
  };

  const unsubscribe = api.subscribe(listener);
  onCleanup(() => unsubscribe());
  return state;
}
