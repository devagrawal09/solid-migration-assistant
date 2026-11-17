// fixture: normal
import { createSignal } from "solid-js";

const [count] = createSignal(0);
const Field = (props: { tabIndex?: number; className?: string }) => <input />;

export function Form() {
  return (
    <form>
      <input readOnly={count()} />
      <button tabIndex={true} />
      <div className="a" class="b" />
      <Field tabIndex={1} className="c" />
      <my-input tabIndex={0} />
      <meta httpEquiv="refresh" />
      <label htmlFor="x" />
    </form>
  );
}
