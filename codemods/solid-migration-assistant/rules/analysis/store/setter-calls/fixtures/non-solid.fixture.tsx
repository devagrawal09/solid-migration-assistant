import { createStore } from "./my-store";

const [store, setStore] = createStore({ count: 0 });
setStore("count", 1);
setStore({ count: 2 });
void store;
