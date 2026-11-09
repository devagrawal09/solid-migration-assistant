import type { JSX } from "@solidjs/web";
import { ThemeContext } from "./theme-context";

// The context is declared in another file; the transform proves it through
// the workspace semantic provider.
export function ThemeProvider(props: { children: JSX.Element }) {
  return <ThemeContext.Provider value="dark">{props.children}</ThemeContext.Provider>;
}
