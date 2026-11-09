// fixture: named-imports
import { render } from "@solidjs/web";
import { hydrate, render as renderApp } from "@solidjs/web";
import { hydrate as singleQuoted } from '@solidjs/web';
import { isServer } from "@solidjs/web";
import type { render as RenderType } from "@solidjs/web";
import { type isServer as IsServerType, hydrate as hydrateApp } from "@solidjs/web";
import {
  isServer as onServer,
  render as renderIndented,
} from "@solidjs/web";
import { render as duplicateOne, render as duplicateTwo } from "@solidjs/web";

void render;
void hydrate;
void renderApp;
void singleQuoted;
void isServer;
void hydrateApp;
void onServer;
void renderIndented;
void duplicateOne;
void duplicateTwo;
type _RenderType = typeof RenderType;
type _IsServerType = IsServerType;
