import { createContext, useContext } from "solid-js";

const ThemeContext = createContext<string>("light");
const UserContext = createContext<{ name: string }>();

export function Provider() {
  return (
    <ThemeContext.Provider value="dark">
      <UserContext.Provider value={{ name: "Alice" }}>
        <App />
      </UserContext.Provider>
    </ThemeContext.Provider>
  );
}

function App() {
  const theme = useContext(ThemeContext);
  return <div class={theme}>content</div>;
}

// A plain object or function with its own Provider member is not a context,
// so its .Provider sites are never reported.
const Fake = { Provider: (props: { value: string; children?: unknown }) => props.children };
function Fn() {
  return null;
}
Fn.Provider = Fake.Provider;
export const notContexts = (
  <>
    <Fake.Provider value="fake" />
    <Fn.Provider value="fn" />
  </>
);
