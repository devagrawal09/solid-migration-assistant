import { createContext, createSignal, For, useContext } from "solid-js";
import { Dynamic, isServer } from "@solidjs/web";
import h from "@solidjs/h";

const ThemeContext = createContext("light");

function Badge(props: { children: string }) {
  return <b>{props.children}</b>;
}

function Item(props: { label: string; index: number }) {
  const theme = useContext(ThemeContext);
  return (
    <li data-index={props.index} data-theme={theme} class={{ themed: theme === "dark" }}>
      <Dynamic component={Badge}>{props.label}</Dynamic>
    </li>
  );
}

export function App(props: { items: string[] }) {
  const [count, setCount] = createSignal(0);
  return (
    <ThemeContext value="dark">
      <ul onClick={() => setCount(count() + 1)} data-server={String(isServer)}>
        <For keyed={false} each={props.items} fallback={<li>empty</li>}>
          {(item, index) => <Item label={item()} index={index} />}
        </For>
      </ul>
    </ThemeContext>
  );
}

void h;
