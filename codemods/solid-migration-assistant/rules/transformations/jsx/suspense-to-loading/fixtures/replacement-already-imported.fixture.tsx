// fixture: replacement-already-imported
import { Loading, Suspense } from "solid-js";

export function Shell(props: { children: unknown }) {
  return (
    <Loading fallback={<p>outer</p>}>
      <Suspense fallback={<p>inner</p>}>{props.children}</Suspense>
    </Loading>
  );
}
