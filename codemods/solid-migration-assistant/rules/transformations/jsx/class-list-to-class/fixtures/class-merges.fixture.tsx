// fixture: class-merges
const isActive = () => true;
const isOpen = () => false;
const active = true;

export function View() {
  return (
    <section>
      <div class="card" classList={{ active: isActive(), hidden: !isActive() }} />
      <button class="btn btn-primary" classList={{ "is-open": isOpen(), active }}>
        merged
      </button>
      <span
        class="px-2 hover:bg-red-500"
        classList={{
          // A comment inside the object literal must survive byte-for-byte.
          "ring-2 ring-offset-1": isActive(),
        }}
        id="first"
      />
      <my-element classList={{ ready: active }} class="host" />
    </section>
  );
}
