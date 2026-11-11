// fixture: no-matches
import { Provider } from "./provider";
import { createContext } from "solid-js";

const AlreadyMigrated = createContext("done");

export const migrated = <AlreadyMigrated value="done">child</AlreadyMigrated>;
export const unrelated = <Provider value="unrelated" />;
const text = "<ThemeContext.Provider value=";
// <ThemeContext.Provider value="comment">
void text;
