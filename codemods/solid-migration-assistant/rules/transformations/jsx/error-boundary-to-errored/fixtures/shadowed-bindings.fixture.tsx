// fixture: shadowed-bindings
import { ErrorBoundary } from "solid-js";

// A local parameter named ErrorBoundary shadows the import inside this
// function; the whole file stays unchanged.
export function Scoped(ErrorBoundary: (props: { fallback: unknown; children?: unknown }) => unknown) {
  return <ErrorBoundary fallback={<p>shadowed</p>}>{"local"}</ErrorBoundary>;
}

export function Outer(props: { children: unknown }) {
  return <ErrorBoundary fallback={<p>outer</p>}>{props.children}</ErrorBoundary>;
}
