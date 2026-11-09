// fixture: aliased-import
import { createContext as makeContext } from "solid-js";

const SettingsContext = makeContext({ compact: false });

export function Settings(props: { children: unknown }) {
  return (
    <SettingsContext value={{ compact: true }}>
      {props.children}
    </SettingsContext>
  );
}
