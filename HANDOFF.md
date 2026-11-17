# Handoff: solid-migration-assistant full Solid 2 stable update

Branch `handoff/sma-solid-2-stable` (local names `stable-dev` / `solid-2-stable`). Written 2026-11-17 for someone picking this up cold. Nothing on this branch has been published to npm or the Codemod registry, and no PR is open. Paths under `/mnt/project-files` are in the project's shared folder, not in this repo.

Read `HANDOFF.md` on `handoff/sma-quick-release` first. That doc explains what the assistant is and covers the retarget to Solid 2.0.0 and the review fixes. This branch is that quick release plus everything else on the Solid 2 stable readiness list.

## Goal

Close every gap in the stable readiness review (`/mnt/project-files/v2-solid-migration-assistant/stable-readiness.md`, summarized below), then battle-test the result against real projects and human migrations. Dev asked for all of it ("3": do everything).

## What's on the branch

Base: the quick release at 0bf3801. Every commit is authored and committed as Dev Agrawal <dev@codemod.com> with no Co-Authored-By trailer.

| Commit | What it does |
|---|---|
| 8d3d2d3 | **reactivity/read-after-write:** in Solid 2 a read right after a write returns the old value until `flush()`. Reports `setX(v); x()` in the same function, with `flush()` or restructure guidance. This was the biggest silent-behavior gap: solid-playground's own migration added `flush()` in 4 places that the assistant had not flagged. |
| 0dc808f | **imports/internal-exports:** `sharedConfig` and `$DEVCOMP` moved to `solid-js/internal`. Also `clearDelegatedEvents` removal guidance in imports/web-import. |
| f6ed054 | **reactivity/function-initial-value:** `createSignal(fn)` / `createStore(fn)` silently become derived in Solid 2. |
| 99ae0be | **jsx/once-marker:** `/*@once*/` is removed. |
| 7a09b02 | **context/default-less-context:** `useContext` on a context with no default now returns `T`, so `=== undefined` checks are dead code (cleanup tier). |
| 64ea77e | **jsx/handler-reads:** `onClick={sel() ? a : b}` reads state when bound; new `STRICT_READ_UNTRACKED` dev warning (cleanup tier). |
| 7ec5373 | **Unknown Solid libraries looked up on npm:** a Solid library missing from the dependency table gets a finding only if its published `solid-js` peer range rules out Solid 2 (`shared/registry.mjs`). |
| a51b5ef | **pnpm catalogs:** migrate moves solid-js, `@solidjs/web` and table dependencies in `pnpm-workspace.yaml` catalogs (default and named), and analyze reads the catalog to judge a `catalog:` range (`shared/catalog.mjs`). |
| ad0d59d | **Output noise:** Codemod's per-step progress (115 stderr lines on a small project) is folded into one live line on a TTY and a closing "Ran N workflow steps in X s". `--verbose` streams the raw lines. The disclosure is kept as is. |
| cf34a0e | **reactivity/owned-write:** a signal or store write in a component body, a `createMemo` compute function or a `createRoot` body throws `REACTIVE_WRITE_IN_OWNED_SCOPE` in Solid 2 dev and stops reactivity. Pairs created with `ownedWrite` are skipped. Runtime behavior was verified on 2.0.0 with probes. |
| 18eb1f6 | **read-after-write precision:** a store read of a field the write provably leaves alone is no longer reported. Two false positives on solid-realworld prompted this. |
| 215e005 | Corpus runs with `--offline` (no npm lookups), and its baseline is refreshed for the new rules. |
| 587035a, 80461ed, 61ddd0e | The quick release's review fixes, carried over. The catalog code gets the same treatment: no downgrade of a dependency already on its Solid 2 line, and mixed ranges count as Solid 1. After a skipped install, "Next" says "the workspace catalog now targets Solid 2.0.0" when the move was in `pnpm-workspace.yaml`. |

### Readiness gaps, status

1. **Pin is an RC:** done on the quick release (2.0.0, a8186e67).
2. **Reads after a write (flush):** done (read-after-write).
3. **Dependency coverage:** table re-verified on npm 2026-11-17, plus npm lookup for unknown libraries.
4. **Monorepos and catalogs:** per-workspace findings (quick release) and pnpm catalogs (here). **Bun and yarn catalogs are not handled.**
5. **Migrate bumps package.json and tsconfig:** done (quick release).
6. **Wrong lint line:** removed (quick release).
7. **Missing rules:** all added except **top-level reactive reads and props destructuring in component bodies**. A draft rule (`untracked-read.ts`, one finding per component, cleanup tier) is saved at `/mnt/project-files/handoff/sma-untracked-read-draft/`, not on this branch. The solid-playground migration added about 8 `untrack` calls by hand, which is evidence for it. Adding it means wiring the rule folder, fixtures, `tests/guide-coverage.json` (that section is currently mapped as excluded), the README and a corpus baseline refresh.
8. **Output noise:** progress folded. Not done: JSON and agent output formats when the workflow runs from the registry. I pushed back on that because it would duplicate the launcher's `buildJsonReport`.

## What was tested

All on the branch head 61ddd0e (or its tree), Node 22, on 2026-11-17.

- `pnpm test` (exit 0), `pnpm check-types`, `pnpm validate`: pass. Each new rule has fixtures (`*.fixture.tsx` with `*.expected.json`) and a mapped section in `tests/guide-coverage.json`.
- `pnpm test:corpus`: 17 of 17 against the refreshed baseline, on the same 16 projects as the quick release. The new rules' corpus findings were read by hand. Owned-write and read-after-write findings on metar-live-web were true positives; the solid-realworld read-after-write false positives were fixed in 18eb1f6.
- `pnpm test:rc-compat`: 3 of 3.
- **Human-migration replay:** analyze on solid-playground at the commit before its own Solid 2 migration, compared with the files and lines the maintainers changed. Precision was about 100%: the files and lines it flagged were ones the maintainers changed.
- **Solid 2.0.0 runtime probes** (Node with browser and development conditions) backed the owned-write and untracked-read semantics: which writes throw, which reads warn, and that `ownedWrite` opts out.

## What was not tested

- No independent review of the 7 new rules. The quick release had one; this branch's additions did not.
- No real install, `tsc` and `vite build` of a migrated third-party app. Same limits as the quick release: corpus typecheck forces `jsxImportSource`, and the corpus migrates with `--no-install`.
- Battle-test plan items not done: fuzzing rule fixtures (aliasing, shadowing, re-exports), differential render of every transform, growing the corpus to the large candidates (sst/opencode, solid-start, solid-primitives, solid-devtools, ark), and a release job that diffs MIGRATION.md and dry-runs the bump.
- Bun and yarn catalogs, Windows, and running from the Codemod registry.

## How to run and verify

```sh
git clone -b handoff/sma-solid-2-stable https://github.com/devagrawal09/solid-migration-assistant.git
cd solid-migration-assistant/codemods/solid-migration-assistant
pnpm install
pnpm verify                       # unit specs + check-types + workflow validate
pnpm test:release                 # rc-compat + corpus; network, Node 22.12+, about 10 minutes
pnpm corpus:update-baseline       # after an intended change; don't edit files while it runs

node bin/solid-migration-assistant.mjs --target /path/to/solid-app            # analyze
node bin/solid-migration-assistant.mjs --target /path/to/solid-app --verbose  # with Codemod's raw step lines
node bin/solid-migration-assistant.mjs transform --target /path/to/solid-app
```

Adding a rule: create `rules/analysis/<domain>/<rule>/<rule>.ts` exporting `analyze*`, add fixtures, run `pnpm generate` (writes the step list, package files list and `tests/rules.generated.ts`), map it in `tests/guide-coverage.json`, then `node ./tests/rule-fixtures.test.mjs --update` and `pnpm fixtures:update`. Shared helpers live in `shared/` (`findImportedCalls`, `referencesOf`, `statePairs` and others).

## Decisions waiting on Dev

1. **Which build to publish as 0.4.0.** **Recommendation:** publish the quick release as 0.4.0 now. Then get an independent review of this branch's 7 rules, bump `package.json` to 0.5.0 and publish this branch. If Dev would rather ship once, this branch is ready on every check that ran; the only thing missing is that review.
2. **Add the top-level read rule?** Recommendation: yes, as a cleanup-tier finding, after the release. The draft is saved, and the playground evidence supports it.
3. **1.0.0 on stable day or stay on 0.x.** Open.

## How it relates to other branches and PRs

- `handoff/sma-quick-release`: this branch's base. The review fixes exist on both, as separate commits.
- `handoff/sma-port-off-state`: prototype of the workflow without `getState`/`setState`, for codemod/codemod #2489 and #2491. It predates the retarget and every rule on this branch, so it needs rebasing onto this branch, and the new rules need porting to return data, once Codemod publishes those PRs.
- Codemod PRs #2486 and #2492 (the dependency step and root lockfile reading) are pending on codemod/codemod. This workflow still reads dependencies itself.

## Next steps

1. Dev's 0.4.0 pick. Then a PR to master and `npm publish`, each only after Dev's yes.
2. An independent review of the 7 new rules (same format as `/mnt/project-files/review-2026-11-17/sma-quick-release.md`).
3. Land the top-level read rule from the saved draft.
4. Remaining battle-test work, in order of value: add sst/opencode (bun catalogs, custom renderer) and solid-primitives to the corpus, fuzz the fixtures, and add the MIGRATION.md diff to `test:release`.
5. Shorten the README. It restates rule internals; moving per-rule detail into each rule folder would roughly halve it.
