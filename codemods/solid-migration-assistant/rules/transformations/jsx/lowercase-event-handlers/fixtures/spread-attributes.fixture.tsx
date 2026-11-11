// fixture: spread-attributes
const handler = () => undefined;
const props = { onClick: handler };

export function View() {
  return (
    <section>
      <button {...props} onclick={handler} />
      <button onclick={handler} {...props} />
      <button {...{ onclick: handler }} />
    </section>
  );
}
