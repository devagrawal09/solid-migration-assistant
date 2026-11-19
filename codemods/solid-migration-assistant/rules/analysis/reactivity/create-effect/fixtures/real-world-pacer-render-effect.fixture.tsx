// fixture: real-world-pacer-render-effect
// Origin: TanStack/pacer, packages/solid-pacer/src/batcher/createBatcher.ts at
// commit 7461510aaf85400a141d0409aa058a6579a6c869, reduced to the option sync
// and unmount effects, with the batcher stubbed. License: MIT
// (https://github.com/TanStack/pacer/blob/7461510aaf85400a141d0409aa058a6579a6c869/LICENSE).
import { createEffect, createRenderEffect, onCleanup, untrack } from "solid-js";

type Batcher = { setOptions(options: object): void; cancel(): void };

export function createBatcher(batcher: Batcher, mergedOptions: () => object) {
  createRenderEffect(() => {
    const latest = mergedOptions();
    untrack(() => batcher.setOptions(latest));
  });

  createEffect(() => {
    onCleanup(() => {
      batcher.cancel();
    });
  });

  return batcher;
}
