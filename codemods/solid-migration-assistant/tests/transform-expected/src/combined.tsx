// Every transform rule has at least one site in this file, so the sequential
// workflow must compose all six rewrites on one source in a single pass.
import { createContext, createSignal, For, useContext } from "solid-js";
import { Dynamic, render } from "@solidjs/web";
import { createRenderer } from "@solidjs/universal";

const ThemeContext = createContext("light");
const [items] = createSignal(["a"]);

function Row(props: { children: unknown }) {
  return <li>{props.children}</li>;
}

export function App() {
  const theme = useContext(ThemeContext);
  return (
    <ThemeContext value="dark">
      <ul class={{ dark: theme === "dark" }} onClick={() => undefined}>
        <For keyed={false} each={items()}>
          {(item, index) => (
            <Dynamic component={Row} data-index={index}>
              {item()}
            </Dynamic>
          )}
        </For>
      </ul>
    </ThemeContext>
  );
}

void createRenderer;
render(() => <App />, document.body);
