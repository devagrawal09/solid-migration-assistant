import { /* before */ createMemo /* after */ } from "solid\x2djs";
import { createMemo as memo } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

createMemo((previous) => previous + 1, 0);
createMemo((previous) => previous + 1, 0, { equals: false });
createMemo((previous) => previous, { equals: false });
createMemo(/* leading */ (previous) => previous + 1, 0);
// prettier-ignore
(createMemo /* callee */)((previous) => previous + 1, 0, { name: "count" });

createMemo(() => 1);
createMemo((previous) => previous, 0, { equals: false }, "extra");
declare const memoArguments: [() => number, number];
createMemo(...memoArguments);
memo((previous) => previous, 0);
Solid.createMemo((previous) => previous, 0);
Other.createMemo((previous) => previous, 0);

const indirect = createMemo;
indirect((previous) => previous, 0);

function shadowed(createMemo: (...args: unknown[]) => unknown) {
  createMemo((previous) => previous, 0);
}

void shadowed;
