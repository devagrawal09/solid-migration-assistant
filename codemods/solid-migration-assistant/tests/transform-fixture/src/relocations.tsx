import h from "solid-js/h";
import html from "solid-js/html";
import { createRenderer } from "solid-js/universal";
import { jsx } from "solid-js/jsx-runtime";
import { jsxDEV } from "solid-js/jsx-dev-runtime";
// prettier-ignore
import { html as singleHtml } from 'solid-js/html';
// prettier-ignore
import { createRenderer as singleRenderer } from 'solid-js/universal';
import { html as escapedHex } from "solid-js\x2fhtml";
import { createRenderer as escapedUnicode } from "solid-js\u002funiversal";
import { jsx as escapedCodePoint } from "solid-js\u{2f}jsx-runtime";
import { jsxDEV as continued } from "solid-js/\
jsx-dev-runtime";

export { h as reexportedH } from "solid-js/h";
export * from "solid-js/html";

const dynamicHtml = import("solid-js/html");
declare const require: (name: string) => unknown;
const commonJsUniversal = require("solid-js/universal");
type RuntimeTypes = import("solid-js/jsx-runtime").JSX;

// solid-js/web moves only when every name in the statement is proven
// compatible; the vetoed and non-named statements below stay byte-identical.
import { render as webRender, hydrate as webHydrate } from "solid-js/web";
import { isServer as webIsServer } from 'solid-js/web';
import { hydrate as webEscapedHydrate } from "solid-js\x2fweb";
import { Dynamic as webDynamicProven } from "solid-js/web";
import { createDynamic as webCreateDynamicVetoed } from "solid-js/web";
export { render as reexportedWebRender } from "solid-js/web";
import { Portal as webVetoed } from "solid-js/web";
import { render as webMixed, Portal as webMixedVeto } from "solid-js/web";
import * as webNamespace from "solid-js/web";
import webDefault from "solid-js/web";
const dynamicWeb = import("solid-js/web");

// Out-of-scope and already-migrated references that must remain byte-identical.
import { createStore as storeIsOutOfScope } from "solid-js/store";
import migratedH from "@solidjs/h";
import migratedHtml from "@solidjs/html";
import { createRenderer as migratedUniversal } from "@solidjs/universal";
import { jsx as migratedRuntime } from "@solidjs/web/jsx-runtime";
import { jsxDEV as migratedDevRuntime } from "@solidjs/web/jsx-dev-runtime";
import { render as migratedWeb } from "@solidjs/web";
import { nearH as prefixNearMiss } from "solid-js/h-extra";
import { nearH as suffixNearMiss } from "vendor/solid-js/h";
import { nearH as trailingSlashNearMiss } from "solid-js/h/";
import { nearStore as escapedNearMiss } from "solid-js\\x2fstore";
import { render as webStorageNearMiss } from "solid-js/web/storage";

void h;
void html;
void createRenderer;
void jsx;
void jsxDEV;
void singleHtml;
void singleRenderer;
void escapedHex;
void escapedUnicode;
void escapedCodePoint;
void continued;
void reexportedH;
void dynamicHtml;
void commonJsUniversal;
void webRender;
void webHydrate;
void webIsServer;
void webEscapedHydrate;
void webDynamicProven;
void webCreateDynamicVetoed;
void webVetoed;
void webMixed;
void webMixedVeto;
void webNamespace;
void webDefault;
void dynamicWeb;
void storeIsOutOfScope;
void migratedH;
void migratedHtml;
void migratedUniversal;
void migratedRuntime;
void migratedDevRuntime;
void migratedWeb;
void prefixNearMiss;
void suffixNearMiss;
void trailingSlashNearMiss;
void escapedNearMiss;
void webStorageNearMiss;
type _RuntimeTypes = RuntimeTypes;
