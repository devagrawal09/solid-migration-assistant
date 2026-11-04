// Lowercase event handler rewrites plus the bailouts the transform must respect.
const handler = () => undefined;
const spread = { onClick: handler };

function Button(props: { onclick: () => void }) {
  return <button onClick={props.onclick}>button</button>;
}

export function View() {
  return (
    <section>
      <button onClick={handler} onInput={handler}>
        rewritten
      </button>
      <my-element onPointerDown={handler} />
      <button onclick={handler} onClick={handler} />
      <button on:click={handler} onclick={handler} />
      <button {...spread} onclick={handler} />
      <link rel="preload" onload="this.rel='stylesheet'" />
      <button onmycustomevent={handler} />
      <Button onclick={handler} />
    </section>
  );
}
