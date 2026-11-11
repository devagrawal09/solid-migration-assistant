/** @jsxImportSource @solidjs/web */
import {
  createContext,
  createSignal,
  Errored,
  For,
  Loading,
  useContext,
} from "solid-js";
import type { JSX } from "@solidjs/web";
import { Dynamic, isServer } from "@solidjs/web";
import h from "@solidjs/h";

const ThemeContext = createContext("light");

function Badge(props: { children: string }): JSX.Element {
  return <b class={["badge", { "badge-wide": props.children.length > 1, hidden: false }]}>{props.children}</b>;
}

function Item(props: { label: string; index: number }) {
  const theme = useContext(ThemeContext);
  return (
    <li data-index={props.index} data-theme={theme} class={{ themed: theme === "dark" }}>
      <Dynamic component={Badge}>{props.label}</Dynamic>
    </li>
  );
}

// Suspense → Loading and ErrorBoundary → Errored renames run in the
// transform; this function keeps the rewritten JSX off the render path so
// the SSR assertion stays stable while the RC compiler still typechecks and
// compiles every rewritten tag against the Loading and Errored signatures.
export function Boundaries(props: { children: JSX.Element }) {
  return (
    <Loading fallback={<p>loading</p>}>
      <Errored fallback={<p>whoops</p>}>{props.children}</Errored>
    </Loading>
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
void Boundaries;
