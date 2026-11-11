// fixture: web-import
import { Loading } from "solid-js/web";

export function Shell(props: { children: unknown }) {
  return <Loading fallback={<p>loading</p>}>{props.children}</Loading>;
}
