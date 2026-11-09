// fixture: aliased-with-store-type
import { createStore as makeStore, type Store } from "solid-js";

const [items, setItems] = makeStore([1, 2, 3]);
setItems((draft) => { draft[0] = 10; });

export const view: Store<number[]> = items;
