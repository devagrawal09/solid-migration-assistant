const flags = { active: true };
const classList = "ordinary identifier";
const text = "<div classList={{ active: true }} />";
// <div classList={{ active: true }} /> is only a comment.

export function View() {
  return (
    <section classList={{ active: true, hidden: false }}>
      {/* Comments around real attributes must not suppress detection. */}
      <div id="first" classList={flags}>
        <span classList={{ nested: true }}>nested</span>
      </div>
      <input classList={{ ready: true }} />
      <Widget classList={["base", { selected: true }]} />
      <Components.Widget classList={{ member: true }} />

      <div class="already-new" />
      <div className="near-miss" />
      <div class-list="near-miss" />
      <div data-classList="near-miss" />
      <div {...{ classList: flags }} />
    </section>
  );
}

function Widget(props: { classList: unknown }) {
  return <pre>{String(props.classList)}</pre>;
}

const Components = { Widget };

void classList;
void text;
