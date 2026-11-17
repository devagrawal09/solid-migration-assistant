// fixture: renderer-types
import { JSX, Show } from "solid-js";
import type { ComponentProps, ValidComponent } from "solid-js";
import { type Component, ComponentProps as Props, JSX as J } from "solid-js";
import {
  createSignal,
  JSX as Multi,
  splitProps,
} from "solid-js";

export const element: JSX.Element = <Show when>{null}</Show>;
export type Button = ComponentProps<"button">;
export type Tag = ValidComponent;
export const Link: Component<Props<"a">> = () => <a />;
export const j: J.IntrinsicElements["div"] = {};
export const m: Multi.Element = <b />;
void createSignal;
void splitProps;
