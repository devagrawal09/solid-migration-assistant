// fixture: rewrites
import { createSignal, Errored } from "solid-js";

const [ready] = createSignal(false);

export function Page() {
  return (
    <main>
      <Errored fallback={<p>whoops</p>}>
        <section>
          {ready() ? <p>ready</p> : <p>pending</p>}
          <Errored
            fallback={
              // A comment inside the container must survive byte-for-byte.
              <b>nested</b>
            }
          >
            <span>deep</span>
          </Errored>
        </section>
      </Errored>
      <Errored fallback={<i>empty tail</i>} />
      <Errored fallback="static string">children</Errored>
      <Errored
        fallback={
          <>
            <p>fragment</p>
          </>
        }
      >
        fragment fallback
      </Errored>
    </main>
  );
}
