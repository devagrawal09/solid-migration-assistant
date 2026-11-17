// fixture: refusals
import { createSignal } from "solid-js";

const [open] = createSignal(false);
const Panel = (props: { "aria-hidden"?: boolean }) => <div />;

export function View() {
  return (
    <section>
      <button aria-expanded={open()} aria-label={"Open"} data-count={3} />
      <input disabled={false} hidden={true} />
      <Panel aria-hidden={true} />
      <my-element aria-hidden={true} />
      <div title={false as never} data-x="true" />
    </section>
  );
}
