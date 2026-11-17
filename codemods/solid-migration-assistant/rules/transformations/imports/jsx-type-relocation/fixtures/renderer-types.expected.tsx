// fixture: renderer-types
import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { ComponentProps, ValidComponent } from "@solidjs/web";
import { type Component } from "solid-js";
import type { ComponentProps as Props, JSX as J } from "@solidjs/web";
import {
  createSignal,
  splitProps,
} from "solid-js";
import type { JSX as Multi } from "@solidjs/web";

export const element: JSX.Element = <Show when>{null}</Show>;
export type Button = ComponentProps<"button">;
export type Tag = ValidComponent;
export const Link: Component<Props<"a">> = () => <a />;
export const j: J.IntrinsicElements["div"] = {};
export const m: Multi.Element = <b />;
void createSignal;
void splitProps;
