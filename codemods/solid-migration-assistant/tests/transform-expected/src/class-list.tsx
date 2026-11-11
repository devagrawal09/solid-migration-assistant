// Intrinsic JSX classList rewrites plus every bailout the transform must respect.
const flags = { active: true };
const other = { hidden: true };
const spread = { class: "card" };

function Widget(props: { classList: unknown }) {
  return <pre>{String(props.classList)}</pre>;
}

const Components = { Widget };

export function View() {
  return (
    <section class={{ active: true, hidden: false }}>
      <div id="first" class={flags}>
        <span class={{ nested: true }}>nested</span>
      </div>

      <div class="card" classList={flags} />
      <div class={["card", { active: flags.active, "is-open": other.hidden }]} />
      <div class="a b" classList={{ b: flags.active }} />
      <div className="card" classList={flags} />
      <div classList={flags} class:active={flags.active} />
      <div {...spread} classList={flags} />
      <div classList={flags} classList={other} />
      <div classList />
      <div classList="active" />
      <div class-list={flags} />
      <Widget classList={flags} />
      <Components.Widget classList={flags} />
      <svg:circle classList={flags} />
    </section>
  );
}
