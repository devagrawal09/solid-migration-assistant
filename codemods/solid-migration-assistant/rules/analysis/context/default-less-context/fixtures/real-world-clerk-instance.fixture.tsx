// fixture: real-world-clerk-instance
// Origin: Resonant-Projects/clerk-solidjs, packages/clerk-solidjs/src/contexts/
// clerk-instance.tsx and src/contexts/portal.tsx at commit
// 320d709852b59cafaae9d4f27d6cc7b197f1801a, reduced to the two default-less
// contexts and their hooks. License: MIT
// (https://github.com/Resonant-Projects/clerk-solidjs/blob/320d709852b59cafaae9d4f27d6cc7b197f1801a/LICENSE).
import { type Accessor, createContext, useContext } from "solid-js";

type LoadedClerk = { loaded: boolean };
type GetContainer = () => HTMLElement | null;

export const ClerkInstanceContext = createContext<Accessor<LoadedClerk>>();

const PortalContext = createContext<GetContainer>();

/**
 * The nearest `UNSAFE_PortalProvider`'s `getContainer`, or `undefined`
 * outside one.
 */
export const usePortalRoot = (): GetContainer | undefined =>
  useContext(PortalContext);

const OutletContext = createContext<{ asProvider: () => boolean }>();

export function useOutletParent() {
  const parent = useContext(OutletContext);
  return parent;
}
