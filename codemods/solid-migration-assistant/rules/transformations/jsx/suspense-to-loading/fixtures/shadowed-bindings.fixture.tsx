// fixture: shadowed-bindings
import { Suspense } from "solid-js";

// A local parameter named Suspense shadows the import inside this function.
export function Scoped(Suspense: (props: { fallback?: unknown; children?: unknown }) => unknown) {
  return <Suspense fallback={<p>shadowed</p>}>{"local"}</Suspense>;
}

// The file-level reference below could still refer to the import, but a
// shadowed binding anywhere in the file leaves the whole file unchanged.
export function Outer(props: { children: unknown }) {
  return <Suspense fallback={<p>outer</p>}>{props.children}</Suspense>;
}
