// fixture: import-shapes
import { ErrorBoundary as Boundary } from "solid-js";

export function Shell(props: { children: unknown }) {
  return <Boundary fallback={<p>boom</p>}>{props.children}</Boundary>;
}
