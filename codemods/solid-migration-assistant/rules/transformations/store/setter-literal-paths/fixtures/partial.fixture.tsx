// fixture: partial
import { createStore } from "solid-js/store";

const [state, setState] = createStore({ user: { name: "a" }, list: [1], count: 0 });
const nextName = "dynamic";

// Rewritten: literal path and literal value.
setState("count", 1);
setState("count", 1.5e3);

// Refused: the value is not a literal (1.x merged objects and called
// functions), the path is not literal, or the call's result is used.
setState("user", { name: "merged" });
setState("count", (count) => count + 1);
setState("user", "name", nextName);
setState("list", [0, 1], 5);
setState("list", { from: 0, to: 0 }, 5);
setState((current) => ({ ...current, count: 2 }));
const result = setState("count", 3);
setState("count", /* why */ 4);
setState("__proto__", "x");

void state;
void result;
