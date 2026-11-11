import { createContext, useContext } from "solid-js";

type Theme = "light" | "dark";

// A createContext with a non-undefined default is NOT default-less; rc.21
// still returns the default outside a provider, so the undefined fallback is
// not necessarily dead code.
const ThemeContext = createContext<Theme>("light");
export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) return "light";
  return theme;
}

// null is a real value, not "not provided": the fallback stays valid.
const Optional = createContext<Theme | null>(null);
export function useOptional() {
  const value = useContext(Optional);
  if (!value) return "light" as const;
  return value;
}

// The call result is never bound to a name that is tested, so the site is
// silent even though the context is default-less.
const Silent = createContext<Theme>();
export function useSilent() {
  const current = useContext(Silent);
  return current.toUpperCase();
}

// Tested in a nested function — the callback captures `ctx`, but the test is
// not in the same body as the useContext call, so the rule stays silent.
const Nested = createContext<Theme>();
export function useNested() {
  const ctx = useContext(Nested);
  return () => (ctx ? ctx : "light");
}

// Spread call shape, computed callee, and extra arguments are all skipped.
declare const args: [typeof Silent];
export function Weird() {
  const a = useContext(...args);
  const b = useContext();
  const c = useContext(Silent, "extra" as unknown as never);
  return [a, b, c];
}
