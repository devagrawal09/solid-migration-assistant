// fixture: errored-shadowed
// A local function named Errored would collide with the renamed import.
import { ErrorBoundary } from "solid-js";

function Errored(props: { children: unknown }) {
  return <span>{props.children}</span>;
}

export function Shell(props: { children: unknown }) {
  return (
    <>
      <Errored>{"local"}</Errored>
      <ErrorBoundary fallback={<p>outer</p>}>{props.children}</ErrorBoundary>
    </>
  );
}
