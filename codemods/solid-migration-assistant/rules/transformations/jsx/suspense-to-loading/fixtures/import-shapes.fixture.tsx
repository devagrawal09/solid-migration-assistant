// fixture: import-shapes
import { Suspense as Wait } from "solid-js";

export function Shell(props: { children: unknown }) {
  return <Wait fallback={<p>loading</p>}>{props.children}</Wait>;
}
