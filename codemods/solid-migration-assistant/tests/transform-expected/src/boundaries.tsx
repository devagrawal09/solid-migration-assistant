// Suspense → Loading and ErrorBoundary → Errored renames: both import
// specifiers and every opening/closing tag are rewritten, and a static
// string or JSX/fragment fallback on ErrorBoundary is accepted.
import { createSignal, Errored, Loading } from "solid-js";

const [ready] = createSignal(false);

export function Shell(props: { children: unknown }) {
  return (
    <main>
      <Loading fallback={<p>loading</p>}>
        <Errored fallback={<p>whoops</p>}>
          {ready() ? props.children : <span>pending</span>}
          <Errored fallback="static">more</Errored>
        </Errored>
      </Loading>
      <Loading>children only</Loading>
    </main>
  );
}
