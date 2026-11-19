// fixture: forms
// Every module form of the two renamed packages, and a build tool's
// jsxImportSource option, keeping quotes.
import { render, screen } from "solid-testing-library";
import solid from 'vite-plugin-solid';
export { cleanup } from "solid-testing-library";

const lazyPlugin = () => import("vite-plugin-solid");
const { default: required } = require("vite-plugin-solid");

export const esbuild = { jsx: "preserve", jsxImportSource: "solid-js" };
export const tsup = { esbuildOptions: { "jsxImportSource": 'solid-js' } };
export const plugins = [solid(), required(), lazyPlugin, render, screen];
