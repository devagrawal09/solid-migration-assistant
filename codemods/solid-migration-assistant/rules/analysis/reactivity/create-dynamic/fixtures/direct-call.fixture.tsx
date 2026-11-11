import { createDynamic } from "solid-js/web";
import { createDynamic as aliased } from "solid-js/web";
import * as Solid from "solid-js/web";
import * as Other from "other-library";

createDynamic(Component, { prop: 1 });
// prettier-ignore
(createDynamic /* callee */)(...args);
aliased(Component, {});
Solid.createDynamic(Component, {});
Other.createDynamic();

const indirect = createDynamic;
indirect();

function shadowed(createDynamic: (...args: unknown[]) => unknown) {
  createDynamic();
}

void shadowed;
