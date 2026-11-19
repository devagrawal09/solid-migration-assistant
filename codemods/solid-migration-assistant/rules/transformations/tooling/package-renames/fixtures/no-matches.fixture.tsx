// fixture: no-matches
// Already renamed, near-miss names, a shadowed require, and a value that is
// not a module source: nothing changes.
import solid from "@solidjs/vite-plugin";
import { render } from "@solidjs/testing-library";
import extra from "vite-plugin-solid-svg";

export default "vite-plugin-solid";
export const settings = { jsxImportSource: "@solidjs/web", moduleName: "solid-js", source: "solid-js" };

function load(require: (id: string) => unknown) {
  return require("vite-plugin-solid");
}
export const used = [solid, render, extra, load];
