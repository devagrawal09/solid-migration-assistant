// fixture: attribute-shapes
import { ErrorBoundary } from "solid-js";

const extraProps = { fallback: <span>spread</span> };

// Any one unsupported element leaves the whole file unchanged, so none of
// the elements below is rewritten and the import stays as ErrorBoundary.
export function Shell(props: { children: unknown }) {
  return (
    <>
      <ErrorBoundary {...extraProps}>{props.children}</ErrorBoundary>
      <ErrorBoundary>{props.children}</ErrorBoundary>
      <ErrorBoundary fallback={<p>ok</p>} name="x">{props.children}</ErrorBoundary>
      <ErrorBoundary fallback={}>{props.children}</ErrorBoundary>
    </>
  );
}
