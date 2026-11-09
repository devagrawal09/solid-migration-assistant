import { /* before */ onError /* after */, catchError, resetErrorBoundaries } from "solid-js";
import { onError as aliased } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

onError((err) => console.error(err));
catchError((err) => console.error(err));
resetErrorBoundaries();
// prettier-ignore
(onError /* callee */)(...args);
aliased();
Solid.onError();
Other.onError();

const indirect = onError;
indirect();

function shadowed(onError: (...args: unknown[]) => unknown) {
  onError();
}

void shadowed;
