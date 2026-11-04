# Contributing

Thanks for helping improve Solid Migration Assistant.

## Preview status

This project is an experimental preview. Its rules, guidance, command-line interface, and supported Solid versions can change without notice. Do not treat a clean analyzer run as proof that a project is ready to migrate.

The repository is public so its design can be inspected, but the preview has not been announced. Hands-on testing is currently invitation-only. Please do not announce, distribute, or recruit testers for the preview.

The supported product behavior is deliberately narrow:

- the default `analyze` workflow is read-only; it never edits the target project;
- the opt-in `transform` workflow applies only rewrites proven equivalent against the pinned Solid 2 RC, refuses a dirty or non-git target unless told otherwise, and reports every edit it makes;
- one detailed terminal guidance string per detected site, plus a count-and-sites summary; and
- no generated reports, dashboards, telemetry, or other persistent analyzer artifacts.

If an `analyze` run changes the target, a `transform` run changes anything it did not report, or either creates an analyzer artifact, stop using it and open a public issue.

## Give feedback in public issues

Open an ordinary issue in the [public issue tracker](https://github.com/devagrawal09/solid-migration-assistant/issues/new). In the title, identify whether the feedback is a false positive, missed migration, unclear guidance, or analyzer failure.

Issues and attachments are public. Reduce examples to the smallest reproduction you can share, remove credentials and identifying data, and never paste proprietary source code or private repository links. Include the analyzer commit, a sanitized command, the relevant terminal guidance, the expected behavior, and the actual behavior. Search existing issues first and submit unrelated problems separately.

## Code changes

Please start with a public issue before proposing a code change. Keep pull requests focused, link the issue, and include behavior-level verification. A new transform rule needs upstream evidence for each rewrite (the Solid 1.9 and pinned RC sources, not guide prose alone), colocated positive, negative, and shadowing fixtures, and idempotency coverage; anything short of a proof belongs in analyzer guidance. Do not add publishing, generated reporting, dashboard, telemetry, or artifact-upload behavior.

By submitting a contribution, you agree that it is licensed under the [MIT License](LICENSE).
