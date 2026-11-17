import type { ComponentProps, ValidComponent } from "solid-js";
import type { ComponentProps as WebProps } from "@solidjs/web";

export type Button = ComponentProps<"button">;
export type Tag = ValidComponent;
export type Anchor = WebProps<"a">;
