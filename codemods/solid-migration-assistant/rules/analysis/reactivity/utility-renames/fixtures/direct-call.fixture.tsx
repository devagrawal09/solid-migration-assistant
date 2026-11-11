import { /* before */ equalFn /* after */, getListener, writeSignal, enableScheduling } from "solid-js";
import { equalFn as aliased } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

equalFn(a, b);
getListener();
writeSignal(sig, 1);
enableScheduling(false);
// prettier-ignore
(equalFn /* callee */)(...args);
aliased();
Solid.equalFn();
Other.equalFn();

const indirect = equalFn;
indirect();

function shadowed(equalFn: (...args: unknown[]) => unknown) {
  equalFn();
}

void shadowed;
