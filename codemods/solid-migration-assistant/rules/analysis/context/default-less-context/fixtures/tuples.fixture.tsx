// fixture: tuples
// Contexts and hooks returned in a tuple and destructured by callers in
// another file (tuples-consumers): a default-less context followed to the
// useContext calls on its destructured binding, and an unchecked hook whose
// destructured binding's caller checks for undefined.
import { createContext, useContext } from "solid-js";

export function createContextAndHook<T>() {
  const Context = createContext<T>();
  const useMaybe = () => useContext(Context);
  return [Context, useMaybe] as const;
}

export const createPlainHook = <T,>() => {
  const Context = createContext<T>();
  const usePlain = () => useContext(Context);
  return [usePlain, Context];
};

// Not followed: the index after a spread isn't known.
export function createSpread<T>(extra: unknown[]) {
  const Context = createContext<T>();
  const useSpread = () => useContext(Context);
  return [...extra, useSpread];
}
