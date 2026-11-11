import { /* before */ unwrap /* after */ } from "solid-js\u002fstore";
import { unwrap as getRaw } from "solid-js/store";
import * as Store from "solid-js/store";
import * as Other from "other-library";

const state = { count: 1 };
const extra = { nested: true };

unwrap(state);
unwrap(/* leading */ state /* trailing */);
// prettier-ignore
(unwrap /* callee */)(state);

unwrap();
unwrap(state, extra);
declare const unwrapArguments: [typeof state];
unwrap(...unwrapArguments);

getRaw(state);
Store.unwrap(state);
Other.unwrap(state);

const indirect = unwrap;
indirect(state);

function shadowed(unwrap: (value: object) => object) {
  unwrap(state);
}

void shadowed;
