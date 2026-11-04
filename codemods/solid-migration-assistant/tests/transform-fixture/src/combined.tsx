// Every transform rule has at least one site in this file, so the sequential
// workflow must compose all six rewrites on one source in a single pass.
import { createContext, createSignal, Index, useContext } from "solid-js";
import { Dynamic, render } from "solid-js/web";
import { createRenderer } from "solid-js/universal";

const ThemeContext = createContext("light");
const [items] = createSignal(["a"]);

function Row(props: { children: unknown }) {
  return <li>{props.children}</li>;
}

export function App() {
  const theme = useContext(ThemeContext);
  return (
    <ThemeContext.Provider value="dark">
      <ul classList={{ dark: theme === "dark" }} onclick={() => undefined}>
        <Index each={items()}>
          {(item, index) => (
            <Dynamic component={Row} data-index={index}>
              {item()}
            </Dynamic>
          )}
        </Index>
      </ul>
    </ThemeContext.Provider>
  );
}

void createRenderer;
render(() => <App />, document.body);
