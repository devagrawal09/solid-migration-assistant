// fixture: lowercase-names
import { createContext } from "solid-js";

// A lowercase-initial name would become an intrinsic <theme> element after
// the rewrite, so it is never proven even though every other check passes.
const theme = createContext("light");

export function Theme(props: { children: unknown }) {
  return <theme.Provider value="dark">{props.children}</theme.Provider>;
}

export const self = <theme.Provider value="dark" />;
