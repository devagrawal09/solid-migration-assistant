// fixture: web-import
import { ErrorBoundary } from "solid-js/web";

export function Shell(props: { children: unknown }) {
  return (
    <ErrorBoundary fallback={<p>boom</p>}>{props.children}</ErrorBoundary>
  );
}
