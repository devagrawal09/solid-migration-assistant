// fixture: rewrites
import { createStore } from "solid-js/store";

const [state, setState] = createStore({ user: { name: "a", tags: ["x"] }, count: 0, "odd key": 1 });

setState("count", 5);
setState("user", "name", "Ann");
setState("user", "tags", 0, "z");
setState("user", "nick", undefined);
setState("count", -1);
setState("user", "active", true);
setState("user", "name", null);
setState("odd key", 2);
setState('user', 'name', 'single');

void state;
