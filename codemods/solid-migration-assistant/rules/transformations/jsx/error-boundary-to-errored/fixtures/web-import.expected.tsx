// fixture: web-import
import { Errored } from "solid-js/web";

export function Shell(props: { children: unknown }) {
  return (
    <Errored fallback={<p>boom</p>}>{props.children}</Errored>
  );
}
