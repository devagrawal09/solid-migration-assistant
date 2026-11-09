// fixture: rewrites
import { createContext, useContext } from "solid-js";

const ThemeContext = createContext<string>("light");
export const UserContext = createContext<{ name: string }>();
const CounterContext = createContext<[() => number, () => void]>();

export function Provider(props: { children: unknown }) {
  const theme = "dark";
  return (
    <ThemeContext value={theme}>
      <UserContext value={{ name: "Alice" }}>
        <CounterContext
          value={
            // A comment inside the container must survive byte-for-byte.
            [() => 1, () => undefined]
          }
        >
          {props.children}
        </CounterContext>
      </UserContext>
    </ThemeContext>
  );
}

export function StringValue() {
  return <ThemeContext value="dark">{useContext(ThemeContext)}</ThemeContext>;
}

export const selfClosing = <ThemeContext value="dark" />;

// A non-JSX member access is neither rewritten nor a reason to refuse the JSX sites.
const LegacyProvider = ThemeContext.Provider;
void LegacyProvider;
