import { createRoot, onCleanup } from "solid-js";

export const topLevel = createRoot((dispose) => dispose);

export function makeController() {
  return createRoot((dispose) => {
    onCleanup(() => undefined);
    return dispose;
  });
}

export const lazy = () => createRoot(() => 1);
