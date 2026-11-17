// fixture: rewrites
import { createSignal } from "solid-js";

const [open] = createSignal(false);

export function View(props: { id: string }) {
  return (
    <section aria-hidden={true} data-active={false}>
      <textarea spellcheck={false} />
      <img draggable={(false)} alt="" />
      <button aria-expanded={!open()} aria-pressed={props.id === "a"} data-open={open() ? true : false} />
      <div
        aria-busy={
          // A comment inside the container must survive.
          true
        }
      />
      <svg aria-hidden={true} />
    </section>
  );
}
