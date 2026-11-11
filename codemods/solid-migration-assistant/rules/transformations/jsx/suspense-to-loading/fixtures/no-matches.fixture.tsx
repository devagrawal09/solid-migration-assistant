// fixture: no-matches
import { Suspense } from "./shell";
import { Loading } from "solid-js";

const items = ["a"];

export const unrelated = (
  <Suspense fallback={<p>loading</p>}>
    <ul>
      {items.map((item) => (
        <li>{item}</li>
      ))}
    </ul>
  </Suspense>
);
export const migrated = <Loading fallback={<p>loading</p>}>{"done"}</Loading>;
const text = "<Suspense fallback=";
// <Suspense fallback={ready()}>
void text;
