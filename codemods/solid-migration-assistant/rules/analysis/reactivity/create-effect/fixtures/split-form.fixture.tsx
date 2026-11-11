import { createEffect } from "solid-js";

declare const dep: () => number;
declare const apply: (value: number) => void;
declare const named: () => void;
declare const options: { defer: true };

// Two-argument calls whose second argument is syntactically a function are
// already in the Solid 2 compute/apply split form, so no finding.
createEffect(() => dep(), (value) => console.log(value));
createEffect(dep, function (value) { console.log(value); });

// Three-argument calls whose second argument is a function and whose third
// argument is an options object are the Solid 2 shape, so no finding.
createEffect(() => dep(), (value) => console.log(value), { defer: true });
createEffect(() => dep(), (value) => console.log(value), options);

// Two-argument calls whose second argument is not a function literal still
// produce a finding, including identifiers (a `stop and ask` case), numbers,
// strings, and object literals.
createEffect(() => dep(), apply);
createEffect((prev = 0) => dep() + prev, 0);
createEffect(() => dep(), "initial");
createEffect(() => dep(), { seed: 0 });

// Three-argument call with a value second argument still produces a finding.
createEffect((prev = 0) => dep() + prev, 0, options);
