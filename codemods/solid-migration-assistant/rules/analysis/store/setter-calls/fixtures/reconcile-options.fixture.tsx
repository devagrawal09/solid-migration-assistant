// fixture: reconcile-options
// reconcile with a 1.x options object is reported; a key that is already a
// string is not, and a local function named reconcile is an object merge.
import { createStore, reconcile as diff } from "solid-js/store";

const [todos, setTodos] = createStore({ items: [] as { id: number }[] });

export function load(items: { id: number }[]) {
  setTodos(diff({ items }, { key: "id", merge: true }));
  setTodos(diff({ items }, "id"));
  setTodos(diff({ items }));
}

function reconcile<T>(value: T): T {
  return value;
}

export function local(items: { id: number }[]) {
  setTodos(reconcile({ items }));
  return todos;
}
