// Context.Provider rewrites plus the bailouts the transform must respect.
import { createContext, useContext } from "solid-js";
import { ImportedContext } from "./shared-context";

const ThemeContext = createContext<string>("light");
const CounterContext = createContext(0);
const props = { value: "spread" };

export function Providers(props: { children: unknown }) {
  return (
    <ThemeContext value="dark">
      <ImportedContext.Provider value="unproven">
        <CounterContext.Provider value={1} />
        {props.children}
      </ImportedContext.Provider>
    </ThemeContext>
  );
}

export function Refused() {
  return (
    <>
      <ThemeContext.Provider>no value</ThemeContext.Provider>
      <ThemeContext.Provider {...props}>spread</ThemeContext.Provider>
      <ThemeContext.Provider value="dark" id="extra" />
    </>
  );
}

export function Shadowed(CounterContext: { Provider: (props: unknown) => unknown }) {
  return <CounterContext.Provider value={2} />;
}

export const theme = () => useContext(ThemeContext);
