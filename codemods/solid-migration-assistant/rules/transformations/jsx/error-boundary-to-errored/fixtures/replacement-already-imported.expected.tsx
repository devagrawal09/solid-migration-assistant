// fixture: replacement-already-imported
import { Errored } from "solid-js";

export function Shell(props: { children: unknown }) {
  return (
    <Errored fallback={<p>outer</p>}>
      <Errored fallback={<p>inner</p>}>{props.children}</Errored>
    </Errored>
  );
}
