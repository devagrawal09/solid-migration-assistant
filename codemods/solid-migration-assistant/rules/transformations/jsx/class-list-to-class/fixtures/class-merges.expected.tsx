// fixture: class-merges
const isActive = () => true;
const isOpen = () => false;
const active = true;

export function View() {
  return (
    <section>
      <div class={["card", { active: isActive(), hidden: !isActive() }]} />
      <button class={["btn btn-primary", { "is-open": isOpen(), active }]}>
        merged
      </button>
      <span
        class={["px-2 hover:bg-red-500", {
          // A comment inside the object literal must survive byte-for-byte.
          "ring-2 ring-offset-1": isActive(),
        }]}
        id="first"
      />
      <my-element class={["host", { ready: active }]} />
    </section>
  );
}
