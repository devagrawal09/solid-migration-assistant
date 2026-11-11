// fixture: attribute-values
export function View() {
  return (
    <section>
      <link rel="preload" onload="this.rel='stylesheet'" />
      <button onclick />
      <button onclick={} />
      <button onclick={/* only a comment */} />
      <button onclick={...[]} />
    </section>
  );
}
