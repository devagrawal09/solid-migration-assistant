// fixture: rewrites
import { createStore } from "solid-js";

const [state, setState] = createStore({ user: { name: "a", tags: ["x"] }, count: 0, "odd key": 1 });

setState((draft) => { draft.count = 5; });
setState((draft) => { draft.user.name = "Ann"; });
setState((draft) => { draft.user.tags[0] = "z"; });
setState((draft) => { delete draft.user.nick; });
setState((draft) => { draft.count = -1; });
setState((draft) => { draft.user.active = true; });
setState((draft) => { draft.user.name = null; });
setState((draft) => { draft["odd key"] = 2; });
setState((draft) => { draft.user.name = 'single'; });

void state;
