// Both rules refuse this file and leave it byte-identical: the Suspense
// element carries an extra attribute, and the ErrorBoundary's fallback is a
// function (whose `err` is a raw value in 1.x and an accessor in 2.0).
import { ErrorBoundary, Suspense } from "solid-js";

export function Shell(props: { children: unknown }) {
  return (
    <>
      <Suspense fallback={<p>ok</p>} name="x">{props.children}</Suspense>
      <ErrorBoundary fallback={(err) => <p>{String(err)}</p>}>
        {props.children}
      </ErrorBoundary>
    </>
  );
}
