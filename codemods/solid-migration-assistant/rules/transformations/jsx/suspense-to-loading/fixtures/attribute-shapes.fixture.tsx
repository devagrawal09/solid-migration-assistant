// fixture: attribute-shapes
import { Suspense } from "solid-js";

const extraProps = { fallback: <span>spread</span> };

// Any one unsupported element leaves the whole file unchanged, so none of
// the elements below is rewritten and the import stays as Suspense.
export function Shell(props: { children: unknown }) {
  return (
    <>
      <Suspense {...extraProps}>{props.children}</Suspense>
      <Suspense fallback="loading">{props.children}</Suspense>
      <Suspense fallback={<p>ok</p>} name="x">{props.children}</Suspense>
      <Suspense fallback={<p>ok</p>} fallback={<p>again</p>}>{props.children}</Suspense>
      <Suspense fallback={}>{props.children}</Suspense>
    </>
  );
}
