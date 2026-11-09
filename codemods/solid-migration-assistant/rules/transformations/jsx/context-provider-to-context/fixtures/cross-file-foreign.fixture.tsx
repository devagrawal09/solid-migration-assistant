// fixture: cross-file-foreign
// A context from another library's createContext, whose provider shape this
// rule cannot prove.
import { createContext } from "react";

export const ForeignContext = createContext("react");
