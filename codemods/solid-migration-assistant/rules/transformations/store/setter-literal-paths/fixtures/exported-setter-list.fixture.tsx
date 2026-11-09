// fixture: exported-setter-list
import { createStore } from "solid-js/store";

// Exported through an export list: the same reason to keep the import.
const [local, setLocal] = createStore({ count: 0 });
setLocal("count", 1);
export { local, setLocal };
