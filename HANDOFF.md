# Handoff: solid-migration-assistant without workflow state (prototype)

Branch `handoff/sma-port-off-state` (local name `port-off-state`). Written 2026-11-17 for someone picking this up cold. This is a prototype: it does not run on any published Codemod, and it should not be merged or published as it is. Paths under `/mnt/project-files` are in the project's shared folder.

## Goal

Workflow v2 is dropping `getState`/`setState` and metrics from the workflow body: codemod/codemod #2489, then #2491. Dev's direction: "state needs to go away completely" in v2, and the migration assistant "should not be using state or metrics". This branch ports the assistant's workflow to that model, so that it is ready once Codemod publishes those PRs. It also gives #2489 a real-world consumer to test against.

## What's on the branch

- Base: 314f90f ("Lint the target, not the assistant, in verify mode"), a commit in the middle of the quick release's history. It is before the guide coverage map, the install and typecheck after migrate, the 2.0.0 retarget and the review fixes.
- One commit, f1f61bd, "Return findings and rewrites as step data instead of workflow state":
  - Each analysis rule returns its findings as jssg data, and each transform returns `{ edit, data }` (`shared/entrypoint.ts`, `shared/analysis.ts`, `shared/transform.ts`).
  - `workflow.ts` collects them from every step's `result.data` instead of `getState(FINDINGS)` / `getState(REWRITES)`.
  - The lint step's summary is still read from `result.state`. #2491 later changed shell steps to return `stdout`/`stderr`/`exitCode` and values written to `$CODEMOD_OUTPUT`, so this part needs updating.
- The original commit (40fc283) was written against #2489 at a03dc72 and sat on history that carried Co-Authored-By trailers. For this push it was cherry-picked onto the trailer-free equivalent base. The tree is identical, and the commit is authored as Dev Agrawal with no trailer.

## What was tested

- When the commit was written, it targeted #2489 at a03dc72. This handoff has no record of a run against a build of that PR, so treat it as unverified.
- Today, with the published `codemod@2.0.0-alpha.3`, `pnpm test` fails as expected. alpha.3 rejects a transform that returns an object: "Codemod transform functions must return either a string or null/undefined". The run stopped at the packaging spec, so the later suites (rules, guards, workflow, transform) did not run.

## What was not tested

- Anything against #2491 or a later #2489 head.
- The corpus, rc-compat and type checks on this branch.

## How to run and verify

It needs a Codemod CLI built from codemod/codemod with #2489 and #2491. Point the package's `codemod` dependency at that build. A local `pnpm link` or a tarball works; no published version has these changes. Then:

```sh
cd codemods/solid-migration-assistant
pnpm install
pnpm verify
```

## Decisions waiting on Dev

- None specific to this branch. It waits on Codemod: #2489 and #2491 need to be merged and published.

## How it relates to other branches and PRs

- It is behind both releases. `handoff/sma-quick-release` and `handoff/sma-solid-2-stable` (the newest) still use workflow state on `codemod@2.0.0-alpha.3`.
- Depends on codemod/codemod #2489 (state and metrics removed; steps return values; jssg returns `{ edit, data }`) and #2491 (shell steps return stdout, stderr and exitCode; jssg data can be any JSON, with a reducer). Related: #2486 and #2492 (dependency graph step reading root lockfiles), which could replace the assistant's own "Read dependencies" step.

## Next steps

1. When Codemod publishes #2489 and #2491: rebase this commit onto `handoff/sma-solid-2-stable`, or onto master once that has merged.
2. Port every rule added since the base, so each one returns findings as data. That covers all the rules added since 314f90f, including the 7 on the stable branch.
3. Read the lint summary from the shell step's returned output, per #2491, instead of `result.state`.
4. Bump the `codemod` dependency to the release that has these PRs, then run `pnpm verify` and `pnpm test:release`.
5. Once #2492 is published, consider replacing the "Read dependencies" step with Codemod's dependency graph.
