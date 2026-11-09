// fixture: cross-file-contexts
// Declares the contexts cross-file-consumer imports; it has no provider JSX.
import { createContext } from "solid-js";

export const ThemeContext = createContext("light");
const ListedContext = createContext(0);
export { ListedContext };
export const ShadowedContext = createContext("shadowed");

// Not provable from the consumer: reassignable, built by a wrapper,
// destructured, or a default export the semantic provider does not follow.
export let MutableContext = createContext(1);
export const WrappedContext = makeContext();
export const [PairContext] = [createContext(2)];
export default createContext(3);

function makeContext() {
  return createContext(4);
}
