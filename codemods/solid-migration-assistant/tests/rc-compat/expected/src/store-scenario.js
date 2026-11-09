import { createRoot } from "solid-js";
import { createStore } from "solid-js";

export function run(flush) {
  const log = [];
  createRoot(() => {
    const [state, setState] = createStore({
      count: 0,
      user: { name: "a", nick: "n", tags: ["x", "y"], meta: { n: 1 } },
      list: [1, 2, 3],
      "odd key": "o",
    });
    const record = (label) => log.push([label, JSON.parse(JSON.stringify(state))]);
    setState((draft) => { draft.count = 5; });
    flush();
    record("count");
    setState((draft) => { draft.user.name = "Ann"; });
    flush();
    record("name");
    setState((draft) => { draft.user.tags[0] = "z"; });
    flush();
    record("tag");
    setState((draft) => { draft.user.meta.n = null; });
    flush();
    record("null");
    setState((draft) => { delete draft.user.nick; });
    flush();
    record("delete");
    setState((draft) => { draft.list[1] = -4; });
    flush();
    record("negative");
    setState((draft) => { draft.user.flag = true; });
    flush();
    record("new key");
    setState((draft) => { draft["odd key"] = "p"; });
    flush();
    record("quoted key");
    setState((draft) => { draft.count = 5; });
    flush();
    record("same value");
  });
  return log;
}
