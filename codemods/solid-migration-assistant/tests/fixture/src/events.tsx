function Widget(props: { onclick: () => void }) {
  return <button onClick={props.onclick}>widget</button>;
}

export const Events = () => (
  <div>
    <button onclick={() => undefined}>lowercase</button>
    <Widget onclick={() => undefined} />
  </div>
);
