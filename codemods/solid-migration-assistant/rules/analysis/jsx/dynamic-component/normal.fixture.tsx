import { Dynamic } from "solid-js/web";
import { Dynamic as Aliased } from "@solidjs/web";
import { Dynamic as Other } from "./dynamic";

const Row = (props: { children: string }) => <li>{props.children}</li>;

export const list = (
  <ul>
    <Dynamic component={Row}>a</Dynamic>
    <Dynamic component="li" />
    <Aliased component={Row}>b</Aliased>
    <Other component={Row}>c</Other>
  </ul>
);
