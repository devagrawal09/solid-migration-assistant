// fixture: aliased-with-store-type
import { createStore as makeStore, type Store } from "solid-js/store";

const [items, setItems] = makeStore([1, 2, 3]);
setItems(0, 10);

export const view: Store<number[]> = items;
