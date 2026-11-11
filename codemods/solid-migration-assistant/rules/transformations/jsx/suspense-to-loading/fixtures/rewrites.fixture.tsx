// fixture: rewrites
import { createSignal, Suspense } from "solid-js";

const [ready] = createSignal(false);

export function Page() {
  return (
    <main>
      <Suspense fallback={<p>loading</p>}>
        <section>
          {ready() ? <p>ready</p> : <p>pending</p>}
          <Suspense
            fallback={
              // A comment inside the container must survive byte-for-byte.
              <b>deep</b>
            }
          >
            <span>deep</span>
          </Suspense>
        </section>
      </Suspense>
      <Suspense>children only</Suspense>
      <Suspense fallback={<i>empty tail</i>} />
    </main>
  );
}
