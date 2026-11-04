// fixture: shadowed-bindings
import { createContext } from "solid-js";

const ThemeContext = createContext("light");
const CounterContext = createContext(0);
const MenuContext = createContext("menu");

export function Theme(props: { children: unknown }) {
  return <ThemeContext.Provider value="dark">{props.children}</ThemeContext.Provider>;
}

// CounterContext is also a parameter name, so no site of it is proven.
export function Counter(CounterContext: { Provider: (props: unknown) => unknown }) {
  return <CounterContext.Provider value={1} />;
}

export function Outer() {
  return <CounterContext.Provider value={2} />;
}

// MenuContext is declared twice, so neither declaration proves its sites.
export function Menu() {
  const MenuContext = { Provider: (props: unknown) => props };
  return <MenuContext.Provider value="inner" />;
}

export const outerMenu = <MenuContext.Provider value="outer" />;
