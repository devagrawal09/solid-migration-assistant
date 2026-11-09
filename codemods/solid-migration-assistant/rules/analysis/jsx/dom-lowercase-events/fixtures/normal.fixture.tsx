import { createSignal } from "solid-js";

function Widget(props: { onclick: () => void }) {
  return <button onClick={props.onclick}>widget</button>;
}

export function View() {
  const [count, setCount] = createSignal(0);
  return (
    <div>
      <button onclick={() => setCount(count() + 1)}>{count()}</button>
      <input oninput={(event) => console.log(event.currentTarget.value)} />
      <my-element onmycustomevent={() => undefined} />
      <link rel="preload" onload="this.rel='stylesheet'" />
      <Widget onclick={() => undefined} />
      <button onClick={() => undefined}>camelCase</button>
    </div>
  );
}
