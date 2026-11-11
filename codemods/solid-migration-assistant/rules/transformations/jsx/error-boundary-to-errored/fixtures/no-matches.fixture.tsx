// fixture: no-matches
import { ErrorBoundary } from "./boundary";
import { Errored } from "solid-js";

export const unrelated = (
  <ErrorBoundary fallback={<p>whoops</p>}>
    <section>pending</section>
  </ErrorBoundary>
);
export const migrated = (
  <Errored fallback={<p>whoops</p>}>
    <section>done</section>
  </Errored>
);
const text = "<ErrorBoundary fallback=";
// <ErrorBoundary fallback={<p>a</p>}>
void text;
