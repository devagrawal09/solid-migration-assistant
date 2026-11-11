import { /* before */ mergeProps /* after */ } from "solid\
-js";
import { mergeProps as merge } from "solid-js";
import * as Solid from "solid-js";
import * as Other from "other-library";

const defaults = { enabled: true };
const maybeProps: { enabled?: boolean } | undefined = undefined;

mergeProps(defaults, { enabled: false });
mergeProps(defaults, maybeProps);
declare const propSources: [{ enabled: boolean }, { label: string }];
mergeProps(...propSources);
// prettier-ignore
(mergeProps /* callee */)(/* leading */ defaults, { label: "ok" });

merge(defaults, {});
Solid.mergeProps(defaults, {});
Other.mergeProps(defaults, {});

const indirect = mergeProps;
indirect(defaults, {});

function shadowed(mergeProps: (...sources: object[]) => object) {
  mergeProps(defaults, {});
}

void shadowed;
