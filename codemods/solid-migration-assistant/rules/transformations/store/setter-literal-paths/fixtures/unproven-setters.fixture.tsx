// fixture: unproven-setters
import { createStore } from "solid-js/store";
import { createStore as otherStore } from "./other-store";

let [mutableState, setMutable] = createStore({ count: 0 });
setMutable("count", 1);

const [otherState, setOther] = otherStore({ count: 0 });
setOther("count", 1);

const [state, setState] = createStore({ count: 0 });
export function shadowed(setState: (...args: unknown[]) => void) {
  setState("count", 2);
}
setState("count", 3);
export const handler = setState;

void mutableState;
void otherState;
void state;
