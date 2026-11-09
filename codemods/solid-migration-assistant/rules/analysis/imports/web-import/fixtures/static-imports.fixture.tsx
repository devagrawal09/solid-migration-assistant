import { render } from "solid-js/web";
import "solid-js/web";
import { render as escapedDouble } from "solid-js\/web";
// prettier-ignore
import { render as escapedSingle } from 'solid-js\/web';
import { render as escapedHex } from "solid-js\x2fweb";
import { render as escapedUnicode } from "solid-js\u002fweb";
import { render as escapedCodePoint } from "solid-js\u{2f}web";
import { render as continued } from "solid-js/\
web";
import { render as escapedNearMiss } from "solid-js\\x2fweb";

export { hydrate } from "solid-js/web";

const dynamicModule = import("solid-js/web");
declare const require: (name: string) => unknown;
const commonJsModule = require("solid-js/web");
type WebTypes = import("solid-js/web").JSX;

import { render as alreadyMigrated } from "@solidjs/web";
import { render as prefixNearMiss } from "solid-js/web-extra";
import { render as suffixNearMiss } from "vendor/solid-js/web";
import { render as trailingSlashNearMiss } from "solid-js/web/";

void render;
void escapedDouble;
void escapedSingle;
void escapedHex;
void escapedUnicode;
void escapedCodePoint;
void continued;
void escapedNearMiss;
void dynamicModule;
void commonJsModule;
void alreadyMigrated;
void prefixNearMiss;
void suffixNearMiss;
void trailingSlashNearMiss;
type _WebTypes = WebTypes;
