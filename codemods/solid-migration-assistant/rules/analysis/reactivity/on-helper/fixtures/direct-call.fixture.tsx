import { /* before */ on /* after */ } from "solid-js";
import { on as aliased } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

on(count, (c) => console.log(c));
// prettier-ignore
(on /* callee */)(...args);
aliased();
Solid.on();
Other.on();

const indirect = on;
indirect();

function shadowed(on: (...args: unknown[]) => unknown) {
  on();
}

void shadowed;
