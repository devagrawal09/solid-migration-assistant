import { from, observable } from "solid-js";
import { from as aliasedFrom } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

from(someSignal);
observable(someObservable);
aliasedFrom(anotherSignal);
Solid.from(anotherSignal);

const indirect = from;
indirect(someSignal);

function shadowed(from: (...args: unknown[]) => unknown) {
  from();
}

void shadowed;
