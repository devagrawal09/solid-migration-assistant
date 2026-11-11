// fixture: type-identifiers
import { Suspense } from "solid-js";

// A type named Loading (or Suspense) means the file already reserves the
// identifier at the type level. Introducing a value Loading would be
// surprising, so the rule leaves the whole file alone.
type Loading = { fallback?: unknown };

export function Shell(props: { fallback?: Loading["fallback"]; children: unknown }) {
  return <Suspense fallback={<p>loading</p>}>{props.children}</Suspense>;
}
