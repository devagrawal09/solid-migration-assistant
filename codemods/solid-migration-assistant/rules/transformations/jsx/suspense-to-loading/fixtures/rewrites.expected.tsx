// fixture: rewrites
import { createSignal, Loading } from "solid-js";

const [ready] = createSignal(false);

export function Page() {
  return (
    <main>
      <Loading fallback={<p>loading</p>}>
        <section>
          {ready() ? <p>ready</p> : <p>pending</p>}
          <Loading
            fallback={
              // A comment inside the container must survive byte-for-byte.
              <b>deep</b>
            }
          >
            <span>deep</span>
          </Loading>
        </section>
      </Loading>
      <Loading>children only</Loading>
      <Loading fallback={<i>empty tail</i>} />
    </main>
  );
}
