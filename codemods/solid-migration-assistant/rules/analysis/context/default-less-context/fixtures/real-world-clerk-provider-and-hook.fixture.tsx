// fixture: real-world-clerk-provider-and-hook
// Origin: Resonant-Projects/clerk-solidjs,
// packages/clerk-solidjs/src/utils/create-context-provider-and-hook.ts at
// commit 320d709852b59cafaae9d4f27d6cc7b197f1801a, unchanged but for this
// header. License: MIT
// (https://github.com/Resonant-Projects/clerk-solidjs/blob/320d709852b59cafaae9d4f27d6cc7b197f1801a/LICENSE).
// The factory returns both hooks in a tuple; real-world-clerk-user-context
// destructures it. useContextUnsafe is the no-Provider variant of
// useContextOrThrow, so it is reported; the port gave the context a null
// default and returned useContext(Context) ?? undefined.
import { createComponent, createContext, type JSX, useContext } from 'solid-js';

/**
 * A context whose provider computes its value from its props, with a hook
 * that throws outside it and one that returns `undefined`. The value is
 * computed once, when the provider renders; pass accessors for values that
 * change.
 */
export function createContextProviderAndHook<T, P extends object>(
  name: string,
  factoryFn: (props: P) => T
) {
  const Context = createContext<T>();

  const ContextProvider = (
    props: P & { children?: JSX.Element }
  ): JSX.Element =>
    createComponent(Context.Provider, {
      value: factoryFn(props),
      get children() {
        return props.children;
      }
    });

  const useContextUnsafe = () => useContext(Context);

  const useContextOrThrow = () => {
    const ctx = useContext(Context);
    if (ctx === undefined) {
      throw new Error(`${name} not found`);
    }
    return ctx;
  };

  return [ContextProvider, useContextOrThrow, useContextUnsafe] as const;
}
