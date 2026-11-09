import { indexArray } from "solid-js";
import { indexArray as aliased } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

indexArray(() => items, (item) => item);
// prettier-ignore
(indexArray /* callee */)(...args);
aliased();
Solid.indexArray();
Other.indexArray();

const indirect = indexArray;
indirect();

function shadowed(indexArray: (...args: unknown[]) => unknown) {
  indexArray();
}

void shadowed;
