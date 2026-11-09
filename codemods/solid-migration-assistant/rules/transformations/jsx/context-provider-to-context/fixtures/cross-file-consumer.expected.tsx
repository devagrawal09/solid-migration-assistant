// fixture: cross-file-consumer
import DefaultContext, {
  ListedContext as Listed,
  MutableContext,
  PairContext,
  ShadowedContext,
  ThemeContext,
  WrappedContext,
} from "./cross-file-contexts.fixture";
import { ForeignContext } from "./cross-file-foreign.fixture";
import * as Contexts from "./cross-file-contexts.fixture";
import { PackageContext } from "some-package";

// Rewritten: each name resolves to a const createContext(...) call from
// solid-js in the declaring file, including through an alias and an
// export list.
export const Rewritten = () => (
  <ThemeContext value="dark">
    <Listed value={1} />
  </ThemeContext>
);

// Refused: let, wrapper, destructured, default export, another library,
// a package import, a namespace import, and a shadowed name.
export const Refused = (props: { ShadowedContext: unknown }) => (
  <>
    <MutableContext.Provider value={2} />
    <WrappedContext.Provider value={3} />
    <PairContext.Provider value={4} />
    <DefaultContext.Provider value={5} />
    <ForeignContext.Provider value={6} />
    <PackageContext.Provider value={7} />
    <Contexts.ThemeContext.Provider value={8} />
    {shadowed(props)}
  </>
);

function shadowed({ ShadowedContext }: { ShadowedContext: unknown }) {
  return <ShadowedContext.Provider value={9} />;
}
