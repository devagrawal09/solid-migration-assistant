/** @jsxImportSource solid-js */
import {
  createContext,
  createSignal,
  ErrorBoundary,
  Index,
  Suspense,
  useContext,
} from "solid-js";
import type { JSX } from "solid-js";
import { Dynamic, isServer } from "solid-js/web";
import h from "solid-js/h";

const ThemeContext = createContext("light");

function Badge(props: { children: string }): JSX.Element {
  return <b class="badge" classList={{ "badge-wide": props.children.length > 1, hidden: false }}>{props.children}</b>;
}

function Item(props: { label: string; index: number }) {
  const theme = useContext(ThemeContext);
  return (
    <li data-index={props.index} data-theme={theme} classList={{ themed: theme === "dark" }}>
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
    <Suspense fallback={<p>loading</p>}>
      <ErrorBoundary fallback={<p>whoops</p>}>{props.children}</ErrorBoundary>
    </Suspense>
  );
}

export function App(props: { items: string[] }) {
  const [count, setCount] = createSignal(0);
  return (
    <ThemeContext.Provider value="dark">
      <ul onclick={() => setCount(count() + 1)} data-server={String(isServer)}>
        <Index each={props.items} fallback={<li>empty</li>}>
          {(item, index) => <Item label={item()} index={index} />}
        </Index>
      </ul>
    </ThemeContext.Provider>
  );
}

void h;
void Boundaries;
