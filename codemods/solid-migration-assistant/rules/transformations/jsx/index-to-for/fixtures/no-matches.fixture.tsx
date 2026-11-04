// fixture: no-matches
import { Index } from "./list";
import { For } from "solid-js";

const items = ["a", "b"];

export const local = <Index each={items}>{(item: () => string) => <i>{item()}</i>}</Index>;
export const migrated = <For keyed={false} each={items}>{(item) => <i>{item()}</i>}</For>;
const text = "<Index each=";
// <Index each={items}>
void text;
