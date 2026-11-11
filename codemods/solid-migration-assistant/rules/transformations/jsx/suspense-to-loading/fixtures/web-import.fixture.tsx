// fixture: web-import
import { Suspense } from "solid-js/web";

export function Shell(props: { children: unknown }) {
  return <Suspense fallback={<p>loading</p>}>{props.children}</Suspense>;
}
