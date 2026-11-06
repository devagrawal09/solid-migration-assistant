// fixture: rewrites
import { createContext, useContext } from "solid-js";

const ThemeContext = createContext<string>("light");
export const UserContext = createContext<{ name: string }>();
const CounterContext = createContext<[() => number, () => void]>();

export function Provider(props: { children: unknown }) {
  const theme = "dark";
  return (
    <ThemeContext.Provider value={theme}>
      <UserContext.Provider value={{ name: "Alice" }}>
        <CounterContext.Provider
          value={
            // A comment inside the container must survive byte-for-byte.
            [() => 1, () => undefined]
          }
        >
          {props.children}
        </CounterContext.Provider>
      </UserContext.Provider>
    </ThemeContext.Provider>
  );
}

export function StringValue() {
  return <ThemeContext.Provider value="dark">{useContext(ThemeContext)}</ThemeContext.Provider>;
}

export const selfClosing = <ThemeContext.Provider value="dark" />;

// A non-JSX member access is neither rewritten nor a reason to refuse the JSX sites.
const LegacyProvider = ThemeContext.Provider;
void LegacyProvider;
