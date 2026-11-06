// fixture: unproven-contexts
import { createContext } from "solid-js";
import * as Solid from "solid-js";
import { createContext as createReactContext } from "react";
import { ImportedContext } from "./contexts";

const NamespaceContext = Solid.createContext("namespace");
const ReactContext = createReactContext("react");
const Wrapped = wrap(createContext("wrapped"));
let MutableContext = createContext("let");
var VarContext = createContext("var");

function wrap<T>(context: T): T {
  return context;
}

export function Providers(props: { children: unknown }) {
  return (
    <ImportedContext.Provider value="imported">
      <NamespaceContext.Provider value="namespace">
        <ReactContext.Provider value="react">
          <Wrapped.Provider value="wrapped">
            <MutableContext.Provider value="let">
              <VarContext.Provider value="var">{props.children}</VarContext.Provider>
            </MutableContext.Provider>
          </Wrapped.Provider>
        </ReactContext.Provider>
      </NamespaceContext.Provider>
    </ImportedContext.Provider>
  );
}
