import { createEffect, createMemo, createRoot, createSignal, on } from "solid-js";

export function run(flush) {
  const log = [];
  let setCount;
  let setOther;
  const dispose = createRoot((dispose) => {
    const [count, set] = createSignal(0);
    const [other, setO] = createSignal("a");
    const doubled = createMemo(() => count() * 2);
    setCount = set;
    setOther = setO;
    createEffect(on(count, (value, prev) => {
      log.push(["signal", value, prev, other()]);
    }));
    createEffect(on(doubled, (value) => {
      log.push(["memo", value]);
    }));
    createEffect(on(() => count() + 100, (value, prev) => {
      log.push(["arrow", value, prev]);
    }));
    return dispose;
  });
  flush();
  log.push(["--", "initial"]);
  setCount(1);
  flush();
  log.push(["--", "count=1"]);
  setOther("b");
  flush();
  log.push(["--", "other=b (untracked inside fn)"]);
  setCount(1);
  flush();
  log.push(["--", "same value"]);
  setCount(2);
  flush();
  dispose();
  setCount(3);
  flush();
  log.push(["--", "after dispose"]);
  return log;
}
