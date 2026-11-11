// Nested JSX module carrying a legacy subpath reference, a proven solid-js/web
// import, a vetoed one, and a classList attribute, so the three import and
// classList rules must edit this one file in a single pass.
import { createRenderer } from "@solidjs/universal";
import { jsx } from "@solidjs/web/jsx-runtime";
import { render, isServer } from "@solidjs/web";
import { Suspense } from "solid-js/web";

export function App() {
  return (
    <div data-renderer={createRenderer} class={{ nested: true }}>
      nested
    </div>
  );
}

const dynamic = import("@solidjs/html");
void dynamic;
void jsx;
void render;
void isServer;
void Suspense;
