// fixture: replacement-already-imported
import { Loading } from "solid-js";

export function Shell(props: { children: unknown }) {
  return (
    <Loading fallback={<p>outer</p>}>
      <Loading fallback={<p>inner</p>}>{props.children}</Loading>
    </Loading>
  );
}
