// fixture: no-matches
import { createStore } from "solid-js";

const [state, setState] = createStore({ count: 0 });
setState((draft) => {
  draft.count = 1;
});
const text = 'setState("count", 1)';
void state;
void text;
