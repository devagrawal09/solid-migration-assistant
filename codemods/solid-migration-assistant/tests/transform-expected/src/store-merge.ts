// The object merge is refused, so the import stays on solid-js/store while
// the literal call beside it is still rewritten.
import { createStore } from "solid-js/store";

const [form, setForm] = createStore({ name: "", touched: false });
setForm((draft) => { draft.touched = true; });
setForm({ name: "merged" });

export { form };
