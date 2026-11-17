# Handoff: solid-migration-assistant quick release (Solid 2.0.0)

Branch `handoff/sma-quick-release` (local name `battle-test-fixes`). Written 2026-11-17 for someone picking this up cold. Nothing on this branch has been published to npm or the Codemod registry, and no PR is open. Paths under `/mnt/project-files` are in the project's shared folder, not in this repo.

## Goal

Ship a release of the Solid 1.9 to Solid 2 migration assistant (`codemods/solid-migration-assistant`) that targets **Solid 2.0.0 stable**, published to npm on 2026-11-17. Master (8c826c2) still targets `2.0.0-rc.23`. This branch makes the smallest set of changes that makes the assistant correct for stable day: retarget, fix the package.json and tsconfig handling, fix the bugs an independent review found, and nothing else. The larger update with new rules lives on `handoff/sma-solid-2-stable`.

## What the assistant is

- An npm CLI (`bin/solid-migration-assistant.mjs`) that runs a Codemod workflow (`workflow.ts`, pinned `codemod@2.0.0-alpha.3`) over a Solid project.
- `analyze` (default) is read-only and prints findings: one per site that needs a manual Solid 2 change, tiered as "will not build", "behaves differently" or "deprecated", each with a migration guide link pinned to the Solid commit.
- `transform` applies deterministic rewrites (import moves, JSX attribute renames, `Index` to `For keyed={false}`, store setter paths and more), moves `package.json` and `tsconfig` to Solid 2, installs with the project's package manager, typechecks, and lists what's left.
- Before the workflow runs, the launcher itself reads every `package.json`, `tsconfig.json`, `tsconfig.*.json` and `jsconfig.json` and reports Solid 1 versions, missing `@solidjs/web` and unknown Solid libraries.

## What's on the branch (on top of master 8c826c2)

Every commit is authored and committed as Dev Agrawal <dev@codemod.com> with no Co-Authored-By trailer.

1. **Battle-test commits (12, 487c6f5 to c0dd90c):** type import moves to `@solidjs/web`; package.json and tsconfig bump in migrate; per-workspace and peer-range checks; React-style attribute renames and `"true"`/`"false"` attribute values; streamed progress and a per-rule summary; corpus typecheck and compile gate against Solid 2; verify mode lints the target; a guide coverage map (`tests/guide-coverage.json`); install and `tsc` after migrate.
2. **53d90c0 Target Solid 2.0.0:** pin moved from rc.23 to 2.0.0 at commit a8186e67 (the npm `gitHead`). MIGRATION.md is byte-identical between rc.23 and 2.0.0. Every dependency in `shared/dependencies.mjs` was re-checked on npm on 2026-11-17; migrate writes `^2.0.0` for solid-js and `@solidjs/web`, a caret for stable dependency releases and an exact version for prereleases.
3. **569b2e8:** drops a false "eslint will keep reporting this" line from store setter findings (the lint rule never fires on 1.x setter call shapes).
4. **0bf3801:** corpus baseline for 2.0.0 (only rewrite messages changed).
5. **1129851 Review fixes:** from the independent review at `/mnt/project-files/review-2026-11-17/sma-quick-release.md`:
   - M1: `tsconfig.*.json` and `jsconfig.json` are now read and bumped, not only `tsconfig.json`. A create-vite `tsconfig.app.json` was silently left on `solid-js`.
   - M2: `node_modules`, `dist`, `build` and `coverage` are skipped when reading configs, with or without git. Outside git, installed packages' manifests were being reported and edited.
   - L1: a dependency already on its Solid 2 line (`@solidjs/router ^2.3.0`) is never moved back to the table's version.
   - L2: only top-level `dependencies` and `devDependencies` are edited, not a nested object of the same name (`pnpm.packageExtensions`).
   - L3: a `catalog:`/tag range for solid-js says it can't be compared instead of calling it a Solid 1 range, and "package.json now targets Solid 2.0.0" is only printed when migrate actually moved solid-js.
   - L4: a range that still admits Solid 1 (`>=1.8.0 <2.0.0`, `^1.9.0 || ^2.0.0-rc.1`) counts as Solid 1.
   - L5: in a workspace the workflow runs when any package is still on Solid 1. Before, the last manifest read decided for the whole repo.
6. **4753173 (L6):** `tools/bump-target.mjs` only replaces the old version where the text names a lockstep Solid package (`Solid 2.0.0`, `solid-js@2.0.0`, `"@solidjs/web": "^2.0.0"`, the `*_VERSION` constants), and lists every other line that still cites it. With a bare `2.0.0` pin the old blanket replace would have rewritten `@solidjs/router@2.0.0`, `codemod 2.0.0-alpha.3` and others. The architecture test now also checks `SOLID_VERSION` in `shared/manifest.mjs` against the pin.
7. **f0b26bb:** corpus baseline for the review fixes (see below).

## What was tested

All on the branch head, Node 22, on 2026-11-17.

- `pnpm test` (exit 0): architecture and guide coverage; CLI, after-migrate, packaging (`npm pack` contents and a run without pnpm on PATH), manifest, registry and catalog specs; every rule fixture; guards (real Codemod runs on temp projects, including the new workspace guard spec); workflow and transform fixtures.
- `pnpm check-types` and `pnpm validate` (Codemod workflow validation): pass.
- `pnpm test:corpus` (needs network): 16 pinned public projects (solid-realworld, templates-vanilla, slippilab, openaq-explorer, codeimage, tasks-md, teardown, usky-app, metar-live-web, schools, clear, kiwitalk, exodium, alist-web, corvu, fit-launcher). For each: analyze is read-only and doesn't crash, transform changes exactly the files it reports, every rewrite parses, a second transform is a no-op, and finding, rewrite, changed-file and Solid 2 compile and type error counts match `tests/corpus/baseline.json`. 17 of 17 tests pass.
  - The review fixes changed the baseline in three projects. tasks-md (`jsconfig.json`) and teardown (`tsconfig.app.json`) now get the jsxImportSource finding and rewrite, which confirms M1 on real code. corvu's post-migrate finding count went from 21 to 214 because its packages keep a `solid-js ^1.8` peer range, which migrate leaves to the user. The old guard skipped that analysis because the last manifest read happened to be on Solid 2. Compile and type error counts did not change.
- `pnpm test:rc-compat` (needs network and Node 22.12+): 3 of 3. It checks that npm `solid-js@latest` is the pinned version and was published from the pinned commit, that the guide coverage map lists exactly the pinned guide's sections, and that a transformed fixture typechecks, compiles and server-renders on Solid 2.0.0 while its 1.9 input does not.
- By hand: `transform --no-install` on a create-vite layout (root `tsconfig.json` with references plus `tsconfig.app.json`) moved `tsconfig.app.json` and left `pnpm.packageExtensions` alone; on a directory outside git with `node_modules/old-lib/package.json`, the installed package was neither reported nor edited.

## What was not tested

- The full `transform` path with a real install, `tsc` and `vite build` of a third-party app. The corpus migrates without installing (`--no-install`). Its typecheck forces `jsxImportSource: "@solidjs/web"` and drops TS2875, so it cannot see a missed tsconfig (the review pointed this out). M1 is covered by specs and the two corpus projects above instead.
- Running the workflow from the Codemod registry rather than through the npm launcher. Nothing has been published, so that path has not run with this code.
- Bun workspaces and catalogs, yarn catalogs, Windows paths.
- No human-migration replay was run against this branch. The replays (solid-playground before its own Solid 2 migration, plus solid-realworld and metar-live-web) were run against the rules on `handoff/sma-solid-2-stable`.

## How to run and verify

```sh
git clone -b handoff/sma-quick-release https://github.com/devagrawal09/solid-migration-assistant.git
cd solid-migration-assistant/codemods/solid-migration-assistant
pnpm install                      # pnpm 11 (packageManager), Node 20+
pnpm verify                       # unit specs + check-types + workflow validate
pnpm test:release                 # rc-compat + corpus; needs network and Node 22.12+ (about 10 minutes)

# try it on a project
node bin/solid-migration-assistant.mjs --target /path/to/solid-app                 # analyze, read-only
node bin/solid-migration-assistant.mjs transform --target /path/to/solid-app      # needs a clean git tree, or --allow-dirty
node bin/solid-migration-assistant.mjs transform --no-install --allow-dirty --target /path   # skip install and typecheck
```

`pnpm corpus:update-baseline` rewrites the corpus baseline after an intended change; commit it with the change. The corpus reads the working tree live, so don't edit files while it runs.

## Decisions waiting on Dev

1. **Which build to publish as 0.4.0 (npm has 0.2.1 today).**
   - Options: this quick release, or `handoff/sma-solid-2-stable` (this branch plus 7 new rules, pnpm catalogs, one-line progress).
   - **Recommendation:** publish this branch as 0.4.0 now. Solid 2.0.0 went stable today, this is the build an independent review covered, and its review bugs are fixed. Then ship the stable branch as 0.5.0 after its new rules get the same independent review.
   - Publishing and pushing to master need Dev's yes. Nothing was published.
2. **Whether stable day should ship as 1.0.0 instead of 0.4.0.** No recommendation yet. 0.x keeps room to change rule output while the Solid 2 ecosystem settles.

## How it relates to other branches and PRs

- `handoff/sma-solid-2-stable` builds on this branch at 0bf3801 and has the same three review-fix commits cherry-picked (as 587035a, 80461ed, 61ddd0e). Fix anything here there too, or merge this branch into it.
- `handoff/sma-port-off-state` is a prototype of the workflow without `getState`/`setState`, branched before the 2.0.0 retarget. It needs a Codemod release that contains codemod/codemod #2489 and #2491.
- Codemod side: #2489 (removes workflow state and metrics) and #2491 (shell steps return output, jssg data reducer) are open on codemod/codemod and not published, so this branch keeps workflow state on `codemod@2.0.0-alpha.3`. #2486 and #2492 (the dependency step and lockfile reading) are also pending there.
- Other branches on the repo (`tembo/*`, `fresh-solid-v2-rewrite`, `agent/rule-dashboard`, `claude/project-thread-7f24xq`, `fable/typescript-orchestration-migration`) were not part of this work.

## Next steps

1. Dev picks the 0.4.0 build. If it's this one: open a PR to master, merge, `npm publish` from `codemods/solid-migration-assistant`, then publish to the Codemod registry.
2. Make the corpus typecheck stop forcing `jsxImportSource` (tests/rc-check.mjs), so a missed tsconfig shows up as type errors.
3. On the next Solid patch release, run `node tools/bump-target.mjs <version> <commit>` and check the lines it lists, then run `pnpm verify` and `pnpm test:release`.
