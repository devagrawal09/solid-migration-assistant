// fixture: shadowed-create-context
import { createContext } from "solid-js";

const ThemeContext = createContext("light");

// A second binding of createContext anywhere in the file makes every
// createContext(...) call ambiguous, so the whole file is left unchanged.
export function Local() {
  const createContext = () => ({ Provider: (props: unknown) => props });
  const LocalContext = createContext();
  return <LocalContext.Provider value="local" />;
}

export const theme = <ThemeContext.Provider value="dark" />;
