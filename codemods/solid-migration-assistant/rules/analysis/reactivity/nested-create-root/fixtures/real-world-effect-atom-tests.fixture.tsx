// fixture: real-world-effect-atom-tests
// Origin: Effect-TS/effect, packages/atom/solid/test/index.test.tsx at commit
// 039e22199d47f4b6cb9d0737ae3d445c9b06aedc, reduced to two tests and one
// render helper, with the atom hooks stubbed. License: MIT
// (https://github.com/Effect-TS/effect/blob/039e22199d47f4b6cb9d0737ae3d445c9b06aedc/LICENSE).
// The runner calls tests and the file's helpers with no owner, so none of
// these roots is nested; only the one created inside another root is.
import { describe, it } from "vitest";
import { type Accessor, createEffect, createRoot } from "solid-js";

declare function useAtomValue<A>(atom: () => A): Accessor<A>;

describe("atom-solid", () => {
  describe("useAtomValue", () => {
    it("reads the value", () => {
      let observed: number | undefined;
      const dispose = createRoot((dispose) => {
        const value = useAtomValue(() => 1);
        createEffect(() => {
          observed = value();
        });
        return dispose;
      });
      dispose();
      return observed;
    });
  });
});

const renderAccessor = function <A>(makeAccessor: () => Accessor<A>, onValue: (_: A) => void) {
  return createRoot((dispose) => {
    const accessor = makeAccessor();
    createEffect(() => {
      onValue(accessor());
    });
    return dispose;
  });
};

it("renders inside a root", () => {
  createRoot(() => {
    createRoot(() => renderAccessor(() => () => 1, () => {}));
  });
});
