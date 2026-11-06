// Nested JSX module carrying a legacy subpath reference, a proven solid-js/web
// import, a vetoed one, and a classList attribute, so the three import and
// classList rules must edit this one file in a single pass.
import { createRenderer } from "solid-js/universal";
import { jsx } from "solid-js/jsx-runtime";
import { render, isServer } from "solid-js/web";
import { Suspense } from "solid-js/web";

export function App() {
  return (
    <div data-renderer={createRenderer} classList={{ nested: true }}>
      nested
    </div>
  );
}

const dynamic = import("solid-js/html");
void dynamic;
void jsx;
void render;
void isServer;
void Suspense;
