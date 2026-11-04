import { createStore } from "solid-js/store";

const [store, setStore] = createStore({ user: { name: "a", tags: ["x"] }, count: 0 });

setStore("user", "name", "b");
setStore("user", "tags", 0, "y");
setStore({ count: 1 });
setStore((prev) => ({ ...prev, count: prev.count + 1 }));
setStore((prev) => {
  if (prev.count > 2) return { count: 0 };
  return undefined;
});
setStore((state) => {
  state.count += 1;
});
setStore((state) => {
  state.user.tags.forEach(() => {
    return "ignored nested return";
  });
});
export const handler = <button onClick={setStore} />;
export const forwarded = [setStore];
void store;
