// fixture: real-world-clerk-consumers
// Origin: Resonant-Projects/clerk-solidjs, packages/clerk-solidjs/src/hooks/
// use-assert-wrapped-by-clerk-provider.tsx, src/contexts/clerk.tsx and
// src/components/ui-components.tsx at commit
// 320d709852b59cafaae9d4f27d6cc7b197f1801a, reduced to the reads of contexts
// declared in another file and of a hook whose callers check for undefined.
// License: MIT
// (https://github.com/Resonant-Projects/clerk-solidjs/blob/320d709852b59cafaae9d4f27d6cc7b197f1801a/LICENSE).
import { useContext } from "solid-js";
import { ClerkInstanceContext, useOutletParent } from "./real-world-clerk-instance.fixture";

export function useAssertWrappedByClerkProvider(displayNameOrFn: string | (() => void)): void {
  const ctx = useContext(ClerkInstanceContext);

  if (!ctx) {
    if (typeof displayNameOrFn === "function") {
      displayNameOrFn();
      return;
    }

    throw new Error(`${displayNameOrFn} can only be used within the <ClerkProvider /> component.`);
  }
}

export const ClerkProvider = (props: { children?: unknown }) => {
  if (useContext(ClerkInstanceContext)) {
    throw new Error("multiple ClerkProviders");
  }
  return props.children;
};

export function UserButtonOutlet() {
  const parent = useOutletParent();
  return parent?.asProvider() ? parent : undefined;
}
