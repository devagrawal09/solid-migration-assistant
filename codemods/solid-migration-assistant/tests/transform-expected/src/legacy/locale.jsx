import { createContext } from "solid-js";

// Declared in a .jsx file, which the semantic provider parses as JavaScript.
export const LocaleContext = createContext("en");

export const LocaleLabel = (props) => <span>{props.locale}</span>;
