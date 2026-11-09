import { /* before */ splitProps /* after */ } from "solid\x2djs";
import { splitProps as split } from "solid-js";
import * as Store from "solid-js";
import * as Other from "other-library";

const props = { id: "item", class: "active", title: "Title" };
const primaryKeys = ["id"] as const;

const [local, rest] = splitProps(props, ["id"]);
const groups = splitProps(/* source */ props, primaryKeys, ["class"]);
// prettier-ignore
(splitProps /* callee */)(props, ["title"]);

splitProps();
splitProps(props);
declare const splitArguments: [typeof props, typeof primaryKeys];
splitProps(...splitArguments);

split(props, ["id"]);
Store.splitProps(props, ["id"]);
Other.splitProps(props, ["id"]);

const indirect = splitProps;
indirect(props, ["id"]);

function shadowed(splitProps: (...args: unknown[]) => unknown) {
  splitProps(props, ["id"]);
}

void local;
void rest;
void groups;
void shadowed;
