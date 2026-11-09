// fixture: rewrites
const flags = { active: true };
const computedKey = "computed";
const condition = true;
const dynamicFlags = () => ({ ready: true });

export function View() {
  return (
    <section class={{ active: true, hidden: false }}>
      <div id="first" class={flags}>
        <span class={{ nested: true }}>nested</span>
      </div>
      <input class={dynamicFlags()} />
      <my-element class={flags} />
      <li
        data-index="1"
        class={
          // A comment inside the container must survive byte-for-byte.
          flags
        }
        style={{ color: "red" }}
      />
      <p class={condition ? flags : { fallback: true }} />
      <b class={flags as Record<string, boolean>} />
      <i class={{ "spaced key": true, [computedKey]: false }} />
      <em style:color="red" class={flags} />
      <u on:click={() => undefined} class={flags} />
      <svg>
        <foreignObject class={flags} />
      </svg>
    </section>
  );
}
