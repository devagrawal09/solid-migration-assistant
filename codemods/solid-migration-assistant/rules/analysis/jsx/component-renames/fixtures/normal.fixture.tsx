import { ErrorBoundary, Index, Suspense, SuspenseList } from "solid\x2djs";
import {
  ErrorBoundary as AliasedErrorBoundary,
  Index as AliasedIndex,
  Suspense as AliasedSuspense,
  SuspenseList as AliasedSuspenseList,
} from "solid-js";
import * as Solid from "solid-js";
import { Suspense as OtherSuspense } from "other-library";

const items = ["one", "two"];
const text = "<Suspense /><ErrorBoundary /><SuspenseList /><Index />";
// <Suspense /> and <Index /> are examples, not JSX sites.

export function App() {
  return (
    <main>
      <Suspense fallback={<p>loading</p>}>
        {/* A nested imported component remains a separate migration site. */}
        <ErrorBoundary fallback={(error) => <p>{error.message}</p>}>
          <section>ready</section>
        </ErrorBoundary>
      </Suspense>

      <Suspense />

      <SuspenseList revealOrder="forwards" tail="collapsed">
        <Suspense fallback={<span>waiting</span>}>
          <span>done</span>
        </Suspense>
      </SuspenseList>

      <Index each={items}>
        {(item, index) => <p data-index={index}>{item()}</p>}
      </Index>

      <AliasedSuspense />
      <AliasedErrorBoundary />
      <AliasedSuspenseList />
      <AliasedIndex each={items}>{(item) => item()}</AliasedIndex>
      <Solid.Suspense />
      <OtherSuspense />
    </main>
  );
}

export function Shadowed(props: { Suspense: () => unknown }) {
  const Suspense = props.Suspense;
  return <Suspense />;
}

function LocalSuspense() {
  return <span>local</span>;
}

const local = <LocalSuspense />;
void text;
void local;
