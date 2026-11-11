import { /* before */ startTransition /* after */, useTransition, createDeferred } from "solid-js";
import { startTransition as aliased } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

startTransition(() => setTab(next));
useTransition();
createDeferred(() => source);
// prettier-ignore
(startTransition /* callee */)(...args);
aliased();
Solid.startTransition();
Other.startTransition();

const indirect = startTransition;
indirect();

function shadowed(startTransition: (...args: unknown[]) => unknown) {
  startTransition();
}

void shadowed;
