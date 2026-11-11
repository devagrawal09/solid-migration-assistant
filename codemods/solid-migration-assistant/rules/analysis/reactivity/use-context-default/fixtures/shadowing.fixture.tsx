// A local useContext or createContext that shadows the Solid import is not
// the Solid API; nothing is reported.
function createContext<T>(): { id: symbol; defaultValue?: T } {
  return { id: Symbol() };
}
function useContext<T>(_ctx: { id: symbol; defaultValue?: T }): T | undefined {
  return undefined;
}

const LocalCtx = createContext<string>();
export function useLocal() {
  const ctx = useContext(LocalCtx);
  if (!ctx) throw new Error("missing");
  return ctx;
}

// Context bound more than once: rule stays silent, since it cannot be sure
// which definition the useContext call reads from at runtime.
import { createContext as createSolidContext, useContext as useSolidContext } from "solid-js";
let Twice = createSolidContext<string>();
Twice = createSolidContext<string>("default");
export function useTwice() {
  const ctx = useSolidContext(Twice);
  if (!ctx) throw new Error("missing");
  return ctx;
}
