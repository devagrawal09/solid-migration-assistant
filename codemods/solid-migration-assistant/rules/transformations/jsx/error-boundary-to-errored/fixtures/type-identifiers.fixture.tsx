// fixture: type-identifiers
import { ErrorBoundary } from "solid-js";

// A type named Errored (or ErrorBoundary) means the file already reserves
// the identifier at the type level; the rule leaves the whole file alone.
type Errored = { fallback: unknown };

export function Shell(props: { fallback: Errored["fallback"]; children: unknown }) {
  return <ErrorBoundary fallback={<p>boom</p>}>{props.children}</ErrorBoundary>;
}
