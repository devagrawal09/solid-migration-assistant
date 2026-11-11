// fixture: non-intrinsic-elements
const handler = () => undefined;

function Button(props: { onclick: () => void }) {
  return <button onClick={props.onclick}>button</button>;
}

const Components = { Button };

export function View() {
  return (
    <>
      <Button onclick={handler} />
      <Components.Button onclick={handler} />
      <svg:rect onclick={handler} />
    </>
  );
}
