// fixture: real-world-clerk-user-context
// Origin: Resonant-Projects/clerk-solidjs,
// packages/clerk-solidjs/src/contexts/user.tsx at commit
// 320d709852b59cafaae9d4f27d6cc7b197f1801a, with the factory imported from
// real-world-clerk-provider-and-hook and the resource type inlined.
// License: MIT
// (https://github.com/Resonant-Projects/clerk-solidjs/blob/320d709852b59cafaae9d4f27d6cc7b197f1801a/LICENSE).
// It destructures the provider and the throwing hook only: nothing to report
// here.
import { Accessor } from 'solid-js';
import { createContextProviderAndHook } from './real-world-clerk-provider-and-hook.fixture';

type UserResource = { id: string };

export const [UserContextProvider, useUserContext] =
  createContextProviderAndHook(
    'UserProvider',
    (props: { user: Accessor<UserResource | null | undefined> }) => {
      return props.user;
    }
  );
