import { createContext, useContext } from "solid-js";

type Todos = { items: string[] };

const TodosContext = createContext<Todos>();
const ExplicitUndefined = createContext<Todos | undefined>(undefined);
const ThemeContext = createContext("light");

export function useTodos() {
  const ctx = useContext(TodosContext);
  if (!ctx) throw new Error("missing TodosContext");
  return ctx;
}

export function useOptionalTodos() {
  const ctx = useContext(TodosContext);
  return ctx ?? { items: [] };
}

export function itemCount() {
  return useContext(ExplicitUndefined)?.items.length ?? 0;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  return theme ?? "dark";
}

export function useTodosDirect() {
  return useContext(TodosContext);
}
