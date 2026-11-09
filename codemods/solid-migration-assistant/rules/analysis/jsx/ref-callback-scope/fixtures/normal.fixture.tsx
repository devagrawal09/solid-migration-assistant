import { createEffect, onCleanup } from "solid-js";

function Widget(props: { ref: (el: HTMLElement) => void }) {
  return <div ref={props.ref} />;
}

export function View() {
  let captured: HTMLElement | undefined;
  const bound = (el: HTMLElement) => {
    onCleanup(() => el.remove());
  };
  return (
    <section>
      <div
        ref={(el) => {
          el.addEventListener("pointerdown", () => undefined);
          onCleanup(() => el.remove());
        }}
      />
      <input ref={function (el) { createEffect(() => el.focus()); }} />
      <span ref={(el) => (captured = el)} />
      <b ref={bound} />
      <Widget ref={(el) => onCleanup(() => el.remove())} />
    </section>
  );
}
