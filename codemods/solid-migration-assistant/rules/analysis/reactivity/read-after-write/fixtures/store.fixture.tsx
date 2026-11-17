import { createStore } from "solid-js/store";

const [state, setState] = createStore({ items: [] as string[], open: false });

export function add(item: string) {
  setState((draft) => {
    draft.items.push(item);
  });
  return state.items.length;
}

export function toggle() {
  const before = state.open;
  setState((draft) => {
    draft.open = !before;
  });
}

export function submit() {
  setState({ open: true });
  return state.items.join(",");
}

export function submitDraft() {
  setState((draft) => {
    draft.open = true;
  });
  return [state.items.length, state.open];
}

export function rename(next: string) {
  setState("items", [next]);
  return state["items"];
}
