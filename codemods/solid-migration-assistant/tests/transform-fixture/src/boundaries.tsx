// Suspense → Loading and ErrorBoundary → Errored renames: both import
// specifiers and every opening/closing tag are rewritten, and a static
// string or JSX/fragment fallback on ErrorBoundary is accepted.
import { createSignal, ErrorBoundary, Suspense } from "solid-js";

const [ready] = createSignal(false);

export function Shell(props: { children: unknown }) {
  return (
    <main>
      <Suspense fallback={<p>loading</p>}>
        <ErrorBoundary fallback={<p>whoops</p>}>
          {ready() ? props.children : <span>pending</span>}
          <ErrorBoundary fallback="static">more</ErrorBoundary>
        </ErrorBoundary>
      </Suspense>
      <Suspense>children only</Suspense>
    </main>
  );
}
