import { createMemo, createRoot, createSignal, onSettled, untrack } from "solid-js";
import { createStore } from "solid-js/store";

const [theme, setTheme] = createSignal("light");

export function Panel(props: { open: boolean }) {
  const [open, setOpen] = createSignal(false);
  if (props.open) setOpen(true);
  untrack(() => setTheme("dark"));
  onSettled(() => setOpen(false));
  return <button onClick={() => setOpen(!open())}>{theme()}</button>;
}

export const List = () => {
  const [state, setState] = createStore({ items: [] as string[] });
  setState((draft) => {
    draft.items = [];
  });
  return <ul>{state.items.length}</ul>;
};

export function useCount() {
  const [count, setCount] = createSignal(0);
  setCount(1);
  const doubled = createMemo(() => {
    setTheme("dark");
    return count() * 2;
  });
  return doubled;
}

export const store = createRoot(() => {
  const [value, setValue] = createSignal(0);
  setValue(1);
  return value;
});

export function Internal() {
  const [ref, setRef] = createSignal<HTMLElement>(undefined, { ownedWrite: true });
  setRef(undefined);
  return <div ref={ref()} />;
}

setTheme("system");
