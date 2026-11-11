// fixture: replacement-already-imported
import { ErrorBoundary, Errored } from "solid-js";

export function Shell(props: { children: unknown }) {
  return (
    <Errored fallback={<p>outer</p>}>
      <ErrorBoundary fallback={<p>inner</p>}>{props.children}</ErrorBoundary>
    </Errored>
  );
}
