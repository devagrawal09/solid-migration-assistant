// fixture: runtime-forms
const dynamicH = import("@solidjs/h");

async function load() {
  const dynamicHtml = await import("@solidjs/html");
  return dynamicHtml;
}

declare const require: (name: string) => unknown;
const requiredUniversal = require("@solidjs/universal");
type RuntimeTypes = import("@solidjs/web/jsx-runtime").JSX;
type DevTypes = typeof import("@solidjs/web/jsx-dev-runtime");

import { require as aliasRequire } from "./helper";
function usesDefault(a = require) {
  return a;
}
const { a = require } = { a: null };
const localAlias = require;

void dynamicH;
void load;
void requiredUniversal;
void aliasRequire;
void usesDefault;
void localAlias;
type _RuntimeTypes = RuntimeTypes;
type _DevTypes = DevTypes;
