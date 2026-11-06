// fixture: class-merge-refusals
const flags = { active: true };
const key = "dynamic";
const active = true;

export function View() {
  return (
    <section>
      <div class="a b" classList={{ b: active }} />
      <div class="a" classList={{ "a b": active }} />
      <div class="card" classList={{ [key]: active }} />
      <div class="card" classList={{ ...flags }} />
      <div class="card" classList={{ active, get hidden() { return false; } }} />
      <div class="card" classList={{ 1: active }} />
      <div class="card" classList={{ undefined: active }} />
      <div class="card" classList={flags} />
      <div class="card" classList={{ ...{} } && flags} />
      <div class="a &amp; b" classList={{ active }} />
      <div class='quoted' classList={{ active }} />
      <div class="line
break" classList={{ active }} />
      <div class={"expression"} classList={{ active }} />
      <div class="card" classList={{ active }} class="twice" />
    </section>
  );
}
