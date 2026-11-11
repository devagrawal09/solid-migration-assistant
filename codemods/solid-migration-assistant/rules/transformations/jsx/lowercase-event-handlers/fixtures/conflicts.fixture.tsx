// fixture: conflicts
const handler = () => undefined;

export function View() {
  return (
    <section>
      <button onclick={handler} onClick={handler} oninput={handler} />
      <button onclick={handler} onclick={handler} />
      <button on:click={handler} onclick={handler} />
      <button oncapture:click={handler} onclick={handler} />
      <button onCLICK={handler} onclick={handler} />
    </section>
  );
}
