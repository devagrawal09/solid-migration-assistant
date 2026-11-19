// fixture: on-settled
// An onMount moved to onSettled by hand with its onCleanup still inside
// throws CLEANUP_IN_FORBIDDEN_SCOPE; a returned cleanup and an onCleanup in
// the component body are fine.
import { onCleanup, onSettled } from "solid-js";

export function Clock() {
  onSettled(() => {
    const timer = setInterval(() => {}, 1000);
    onCleanup(() => clearInterval(timer));
  });
  onSettled(() => {
    const timer = setInterval(() => {}, 1000);
    return () => clearInterval(timer);
  });
  onCleanup(() => {});
  return null;
}
