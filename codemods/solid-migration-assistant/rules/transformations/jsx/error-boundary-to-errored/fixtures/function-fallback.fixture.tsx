// fixture: function-fallback
// Every element that is not a provably non-function fallback leaves the
// whole file unchanged, because renaming only the safe ones would still
// break the file at the refused elements.
import { ErrorBoundary } from "solid-js";

const fallbackFn = (err: Error) => <p>{err.message}</p>;

export function Shell(props: { children: unknown }) {
  return (
    <>
      <ErrorBoundary fallback={(err) => <p>{err.message}</p>}>
        {props.children}
      </ErrorBoundary>
      <ErrorBoundary fallback={function fn(err) { return <p>{String(err)}</p>; }}>
        {props.children}
      </ErrorBoundary>
      <ErrorBoundary fallback={fallbackFn}>{props.children}</ErrorBoundary>
      <ErrorBoundary fallback={getFallback()}>{props.children}</ErrorBoundary>
      <ErrorBoundary fallback={<p>plain</p>}>{props.children}</ErrorBoundary>
    </>
  );
}

function getFallback() {
  return <p>maybe</p>;
}
