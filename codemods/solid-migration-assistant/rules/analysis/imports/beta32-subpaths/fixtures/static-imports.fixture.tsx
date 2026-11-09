import { createStore } from "solid-js/store";
import h from "solid-js/h";
import html from "solid-js/html";
import { createRenderer } from "solid-js/universal";
import { jsx } from "solid-js/jsx-runtime";
import { jsxDEV } from "solid-js/jsx-dev-runtime";
// prettier-ignore
import type { Store } from 'solid-js/store';
import { h as escapedSlash } from "solid-js\/h";
// prettier-ignore
import { html as escapedSingle } from 'solid-js\/html';
import { html as escapedHex } from "solid-js\x2fhtml";
import { createRenderer as escapedUnicode } from "solid-js\u002funiversal";
import { jsx as escapedCodePoint } from "solid-js\u{2f}jsx-runtime";
import { jsxDEV as continued } from "solid-js/\
jsx-dev-runtime";

export { createStore as reexportedStore } from "solid-js/store";
export * from "solid-js/h";

const dynamicHtml = import("solid-js/html");
declare const require: (name: string) => unknown;
const commonJsUniversal = require("solid-js/universal");
type RuntimeTypes = import("solid-js/jsx-runtime").JSX;

import { createSignal as alreadyMigratedStore } from "solid-js";
import migratedH from "@solidjs/h";
import migratedHtml from "@solidjs/html";
import { createRenderer as migratedUniversal } from "@solidjs/universal";
import { jsx as migratedRuntime } from "@solidjs/web/jsx-runtime";
import { jsxDEV as migratedDevRuntime } from "@solidjs/web/jsx-dev-runtime";
import { render as exactWeb } from "solid-js/web";
import { nearStore as prefixNearMiss } from "solid-js/store-extra";
import { nearStore as suffixNearMiss } from "vendor/solid-js/store";
import { nearStore as trailingSlashNearMiss } from "solid-js/store/";
import { nearStore as escapedNearMiss } from "solid-js\\x2fstore";

void createStore;
void h;
void html;
void createRenderer;
void jsx;
void jsxDEV;
void escapedSlash;
void escapedSingle;
void escapedHex;
void escapedUnicode;
void escapedCodePoint;
void continued;
void dynamicHtml;
void commonJsUniversal;
void alreadyMigratedStore;
void migratedH;
void migratedHtml;
void migratedUniversal;
void migratedRuntime;
void migratedDevRuntime;
void exactWeb;
void prefixNearMiss;
void suffixNearMiss;
void trailingSlashNearMiss;
void escapedNearMiss;
type _Store = Store;
type _RuntimeTypes = RuntimeTypes;
