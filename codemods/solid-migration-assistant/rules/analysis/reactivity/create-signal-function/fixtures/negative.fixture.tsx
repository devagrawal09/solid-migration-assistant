import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

// Non-function initial values stay silent.
const [count] = createSignal(0);
const [name] = createSignal("alice");
const [list] = createStore({ total: 0 });
const [arr] = createStore([1, 2, 3]);

// A name the file cannot prove is a function: `let`, parameter, destructured,
// imported, bound more than once, or unresolved.
let later: () => number;
const [h] = createSignal(later);

function inside(cb: () => number) {
  return createSignal(cb);
}

const [first, second] = [() => 1, () => 2];
const [j] = createSignal(first);

import { fromElsewhere } from "./nowhere";
const [k] = createSignal(fromElsewhere);

const twice = () => 1;
// eslint-disable-next-line @typescript-eslint/no-redeclare
var twice = () => 2;
const [l] = createSignal(twice);

// `const` bound to a non-function value is not reported.
const notAFn = 42;
const [m] = createSignal(notAFn);

// Spread call shape is refused.
declare const args: [() => number];
const [n] = createSignal(...args);

void inside;
void h;
void j;
void k;
void l;
void m;
void n;
