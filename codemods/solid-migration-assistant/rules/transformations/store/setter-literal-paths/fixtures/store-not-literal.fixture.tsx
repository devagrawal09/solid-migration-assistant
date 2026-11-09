// fixture: store-not-literal
import { createStore } from "solid-js/store";

declare const initial: { count: number };
// The initial value is not a literal, so the import does not move; the
// literal setter call is still rewritten.
const [state, setState] = createStore(initial);
setState("count", 1);

void state;
