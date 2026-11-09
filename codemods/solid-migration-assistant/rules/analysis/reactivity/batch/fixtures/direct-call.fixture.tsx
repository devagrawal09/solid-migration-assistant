import { /* before */ batch /* after */ } from "solid-js";
import { batch as aliased } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

batch(() => { setCount(1); });
// prettier-ignore
(batch /* callee */)(...args);
aliased();
Solid.batch();
Other.batch();

const indirect = batch;
indirect();

function shadowed(batch: (...args: unknown[]) => unknown) {
  batch();
}

void shadowed;
