import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";

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
    setState("count", 5);
    flush();
    record("count");
    setState("user", "name", "Ann");
    flush();
    record("name");
    setState("user", "tags", 0, "z");
    flush();
    record("tag");
    setState("user", "meta", "n", null);
    flush();
    record("null");
    setState("user", "nick", undefined);
    flush();
    record("delete");
    setState("list", 1, -4);
    flush();
    record("negative");
    setState("user", "flag", true);
    flush();
    record("new key");
    setState("odd key", "p");
    flush();
    record("quoted key");
    setState("count", 5);
    flush();
    record("same value");
  });
  return log;
}
