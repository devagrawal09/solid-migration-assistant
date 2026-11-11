// fixture: rewrites
import { createSignal, ErrorBoundary } from "solid-js";

const [ready] = createSignal(false);

export function Page() {
  return (
    <main>
      <ErrorBoundary fallback={<p>whoops</p>}>
        <section>
          {ready() ? <p>ready</p> : <p>pending</p>}
          <ErrorBoundary
            fallback={
              // A comment inside the container must survive byte-for-byte.
              <b>nested</b>
            }
          >
            <span>deep</span>
          </ErrorBoundary>
        </section>
      </ErrorBoundary>
      <ErrorBoundary fallback={<i>empty tail</i>} />
      <ErrorBoundary fallback="static string">children</ErrorBoundary>
      <ErrorBoundary
        fallback={
          <>
            <p>fragment</p>
          </>
        }
      >
        fragment fallback
      </ErrorBoundary>
    </main>
  );
}
