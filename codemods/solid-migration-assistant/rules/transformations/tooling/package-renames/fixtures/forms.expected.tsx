// fixture: forms
// Every module form of the two renamed packages, and a build tool's
// jsxImportSource option, keeping quotes.
import { render, screen } from "@solidjs/testing-library";
import solid from '@solidjs/vite-plugin';
export { cleanup } from "@solidjs/testing-library";

const lazyPlugin = () => import("@solidjs/vite-plugin");
const { default: required } = require("@solidjs/vite-plugin");

export const esbuild = { jsx: "preserve", jsxImportSource: "@solidjs/web" };
export const tsup = { esbuildOptions: { "jsxImportSource": '@solidjs/web' } };
export const plugins = [solid(), required(), lazyPlugin, render, screen];
