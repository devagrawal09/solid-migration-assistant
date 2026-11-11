// fixture: loading-shadowed
// A local function named Loading would collide with the renamed import.
import { Suspense } from "solid-js";

function Loading(props: { children: unknown }) {
  return <span>{props.children}</span>;
}

export function Shell(props: { children: unknown }) {
  return (
    <>
      <Loading>{"local"}</Loading>
      <Suspense fallback={<p>outer</p>}>{props.children}</Suspense>
    </>
  );
}
