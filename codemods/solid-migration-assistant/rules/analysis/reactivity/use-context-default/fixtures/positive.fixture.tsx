import { createContext, useContext } from "solid-js";

type TodosCtx = { todos: readonly string[]; addTodo: (t: string) => void };

const TodosContext = createContext<TodosCtx>();
const UndefinedDefault = createContext<TodosCtx>(undefined);

// Classic wrapper hook: throw on undefined.
export function useTodos() {
  const ctx = useContext(TodosContext);
  if (!ctx) throw new Error("missing TodosContext.Provider");
  return ctx;
}

// Explicit undefined comparison.
export function useTodos2() {
  const ctx = useContext(TodosContext);
  if (ctx === undefined) throw new Error("missing provider");
  return ctx;
}

// Null comparison also counts (rc.21 treats undefined as "not provided").
export function useTodos3() {
  const ctx = useContext(TodosContext);
  if (ctx === null) throw new Error("missing provider");
  return ctx;
}

// Nullish coalescing.
export function useTodos4() {
  const ctx = useContext(TodosContext);
  return ctx ?? { todos: [] as readonly string[], addTodo: () => undefined };
}

// Logical OR.
export function useTodos5() {
  const ctx = useContext(TodosContext);
  return ctx || { todos: [] as readonly string[], addTodo: () => undefined };
}

// Optional chaining.
export function useTodos6() {
  const ctx = useContext(TodosContext);
  return ctx?.todos;
}

// Default-less because the single argument is literally `undefined`.
export function useAlso() {
  const ctx = useContext(UndefinedDefault);
  if (!ctx) throw new Error("missing");
  return ctx;
}
