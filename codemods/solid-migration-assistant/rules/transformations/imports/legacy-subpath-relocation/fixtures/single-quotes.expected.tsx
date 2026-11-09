// fixture: single-quotes
import h from '@solidjs/h';
import { render } from '@solidjs/html';
import { createRenderer } from '@solidjs/universal';
import { jsx } from '@solidjs/web/jsx-runtime';
import { jsxDEV } from '@solidjs/web/jsx-dev-runtime';
export { h as exportedH } from '@solidjs/h';
export * from '@solidjs/html';
const dynamicHtml = import('@solidjs/html');
declare const require: (name: string) => unknown;
const commonJsUniversal = require('@solidjs/universal');
type RuntimeTypes = import('@solidjs/web/jsx-runtime').JSX;

void h;
void render;
void createRenderer;
void jsx;
void jsxDEV;
void exportedH;
void dynamicHtml;
void commonJsUniversal;
type _RuntimeTypes = RuntimeTypes;
