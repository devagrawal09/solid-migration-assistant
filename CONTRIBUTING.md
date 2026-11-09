# Contributing

Thanks for helping improve Solid Migration Assistant.

## Preview status

This project is an experimental preview. Its rules, guidance, command-line interface, and supported Solid versions can change without notice. Do not treat a clean analyzer run as proof that a project is ready to migrate.

The repository is public so its design can be inspected, but the preview has not been announced. Hands-on testing is currently invitation-only. Please do not announce, distribute, or recruit testers for the preview.

The supported product behavior is deliberately narrow:

- the default `analyze` workflow is read-only; it never edits the target project;
- the opt-in `transform` workflow applies only rewrites proven equivalent against the pinned Solid 2 RC, refuses a dirty or non-git target unless told otherwise, and reports every edit it makes;
- one structured finding per detected site, rendered as terminal guidance plus a count-and-sites summary (or as JSON or an agent work list); and
- no generated reports, dashboards, telemetry, or other persistent analyzer artifacts.

If an `analyze` run changes the target, a `transform` run changes anything it did not report, or either creates an analyzer artifact, stop using it and open a public issue.

## Give feedback in public issues

Open an ordinary issue in the [public issue tracker](https://github.com/devagrawal09/solid-migration-assistant/issues/new). In the title, identify whether the feedback is a false positive, missed migration, unclear guidance, or analyzer failure.

Issues and attachments are public. Reduce examples to the smallest reproduction you can share, remove credentials and identifying data, and never paste proprietary source code or private repository links. Include the analyzer commit, a sanitized command, the relevant terminal guidance, the expected behavior, and the actual behavior. Search existing issues first and submit unrelated problems separately.

## Code changes

Please start with a public issue before proposing a code change. Keep pull requests focused, link the issue, and include behavior-level verification. To add a rule, create `rules/<analysis|transformations>/<domain>/<rule>/<rule>.ts` exporting its `analyze*` or `relocate*`/`rewrite*` functions plus a `fixtures/` folder, run `pnpm --dir codemods/solid-migration-assistant generate` (which writes the entrypoints, workflow steps, and packaged file list), then `pnpm --dir codemods/solid-migration-assistant fixtures:update`, and review every expected file it writes. A finding states its own severity; a transform that relies on another file must prove it through `shared/provenance.ts`, never from the absence of a semantic reference. A new or widened transform rule needs upstream evidence for each rewrite (the Solid 1.9 and pinned RC sources, not guide prose alone), colocated positive, negative, and shadowing fixtures, and idempotency coverage; anything short of a proof belongs in analyzer guidance. Before review, also run `pnpm --dir codemods/solid-migration-assistant test:release`, read every hunk the rule produces on the corpus projects and summarize that review in the pull request, add a case for the rule to `tests/rc-compat/project`, and commit the refreshed `tests/corpus/baseline.json` so its diff shows the rule's effect on real code. Any pull request that changes analyzer output on the corpus commits the baseline diff the same way. Do not add publishing, generated reporting, dashboard, telemetry, or artifact-upload behavior.

By submitting a contribution, you agree that it is licensed under the [MIT License](LICENSE).
