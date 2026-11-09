// fixture: import-stays
import { createStore, produce } from "solid-js/store";

// produce shares the statement, so the import cannot move even though the
// only setter call is rewritten.
const [state, setState] = createStore({ count: 0 });
setState((draft) => { draft.count = 1; });

void state;
void produce;
