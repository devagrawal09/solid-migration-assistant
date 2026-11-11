// fixture: unknown-events
const handler = () => undefined;

export function View() {
  return (
    <section>
      <my-element onmycustomevent={handler} />
      <button onfoo={handler} />
      <button onClick={handler} />
      <button onclick-extra={handler} />
      <button data-onclick={handler} />
      <button on={handler} />
    </section>
  );
}
