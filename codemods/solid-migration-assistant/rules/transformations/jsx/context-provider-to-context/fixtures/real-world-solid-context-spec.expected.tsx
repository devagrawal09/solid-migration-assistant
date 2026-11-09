// fixture: real-world-solid-context-spec
// Origin: solidjs/solid, packages/solid/web/test/context.spec.tsx at tag
// v1.9.13 (commit 3be495cec52bf78d7cc61f054af00320ecf4058c), reduced to the
// context declaration and the first two provider cases, with the test
// framework calls and relative source imports replaced by package imports.
// License: MIT, Copyright (c) 2016-2025 Ryan Carniato
// (https://github.com/solidjs/solid/blob/v1.9.13/LICENSE).
import { createContext, useContext } from "solid-js";
import { render, Show } from "solid-js/web";

const ThemeContext = createContext("light");
const Component = () => {
  const theme = useContext(ThemeContext);
  return <div>{theme}</div>;
};
const CondComponent = () => {
  const theme = useContext(ThemeContext);
  return (
    <Show when={true}>
      <div>{theme}</div>
    </Show>
  );
};
const div = document.createElement("div");

export function singleProviderChild() {
  render(
    () => (
      <ThemeContext value="dark">
        <Component />
      </ThemeContext>
    ),
    div
  );
}

export function singleConditionalProviderChild() {
  render(
    () => (
      <ThemeContext value="dark">
        <CondComponent />
      </ThemeContext>
    ),
    div
  );
}
