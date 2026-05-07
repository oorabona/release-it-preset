# ADR-0002: Strict `extends` validation in `.release-it.json`

- **Status**: Amended (2026-05-07) — see [ADR-0006](./0006-relaxed-mismatch-policy.md) for the relaxed mismatch policy. The first invariant ("extends required") remains in force.
- **Date**: 2025-10-06
- **Deciders**: maintainers

## Context

Before v0.8.1, the CLI accepted a `.release-it.json` file regardless of
whether it contained an `extends` field pointing to the preset. This created a
silent misconfiguration path: a user could have `.release-it.json` in their
project without `extends`, and release-it would load only their file, falling
back to release-it's own defaults instead of the preset's.

The concrete failures observed (documented in CHANGELOG.md v0.8.1):

- `npm.publish` defaults to `true` in release-it's own defaults, whereas the
  preset sets it to `false` (opt-in via `NPM_PUBLISH=true`). A user without
  `extends` could accidentally publish to npm on every release.
- The preset's lifecycle hooks (`before:bump` for `populate-unreleased-changelog`,
  `after:release` for `republish-changelog`) are never invoked — changelog
  automation is silently skipped.
- GitHub release settings from the preset's config are ignored.

v0.8.0 introduced validation but documented "Mode 2" — using the CLI alongside
a `.release-it.json` without `extends` — as supported. This was incorrect:
release-it's merge semantics require `extends` to know which config to inherit
from. v0.8.1 (commit `c3cb04f`) removed Mode 2 and made `extends` mandatory.

The pattern is consistent with how other configuration-extension tools work:

- TypeScript: `tsconfig.json` requires `extends` for inheritance
- ESLint: `.eslintrc` requires `extends` for shared config inheritance
- Prettier: config inheritance requires an explicit base

Without an explicit `extends`, the tool has no way to discover the preset.

## Decision

> **Note (2026-05-07)**: The "hard-error on mismatch" invariant below has been
> superseded by [ADR-0006](./0006-relaxed-mismatch-policy.md). The CLI now warns
> and uses the invoked preset's config via `--config <path>` for that run.
> The first invariant in this ADR — `extends` is required when `.release-it.json`
> exists — REMAINS in force.

(Original decision text below preserved for historical context.)

When `.release-it.json` exists in the working directory, `bin/cli.js` validates
that it contains an `extends` field pointing to the invoked preset. Specifically:

1. If `extends` is absent: error with instructions to add it.
2. If `extends` is present but does not match the CLI command (e.g. CLI says
   `hotfix` but `extends` references `default`): error with two resolution
   options (use the extends-specified preset, or update `extends`).
3. If `.release-it.json` is absent: the preset config is passed directly via
   `--config` to release-it.

The validation logic lives in `handleReleaseCommand()` in `bin/cli.js`. Auto-
detection mode (no CLI argument) reads `extends` and derives the preset name
from it, so the same invariant is enforced in both modes.

## Alternatives considered

- **Infer the preset from the CLI command and inject it**: Mutate the user's
  config at runtime to add `extends`. Rejected because it requires writing to
  the user's config file or spawning release-it with a merged config — both
  are fragile and surprising.
- **Warn instead of error**: Keep Mode 2 with a deprecation warning. Rejected
  because the failure mode (accidental publish) is severe enough to warrant a
  hard error. Silent misconfiguration is worse than a clear error message.
- **Document the failure mode and leave validation to users**: Acceptable only
  if the failure mode is low-stakes. Given that `npm.publish: true` is the
  release-it default, this option was ruled out.
- **Validate `extends` format only, not content**: Ensure `extends` is a non-
  empty string. Rejected in favor of full content validation: a mismatch
  between CLI preset and `extends` value is a different class of error
  (configuration conflict, not just missing config) and deserves its own
  error message.

## Consequences

- **Positive**: Eliminates the silent publish-misconfiguration footgun.
  Changelog automation is reliably invoked when configured.
- **Positive**: Error messages are actionable — they tell the user exactly
  what to add and where.
- **Positive**: Consistent with TypeScript, ESLint, Prettier conventions.
  Contributors familiar with those tools will recognize the pattern.
- **Negative**: Users who intentionally had `.release-it.json` without
  `extends` (e.g. legacy projects on v0.8.0 following the now-removed
  documentation) must update their config. CHANGELOG.md v0.8.1 documented
  the fix steps.
- **Negative**: Passthrough mode (`--config <file>`) bypasses this validation
  by design — it delegates directly to release-it without preset awareness.
  This is the correct trade-off for advanced workflows.

## References

- `bin/cli.js` `handleReleaseCommand()` (validation logic)
- CHANGELOG.md v0.8.0 (original validates-but-wrong-docs) and v0.8.1 (fix)
- Commit `c3cb04f` — enforce required `extends` field
- Commit `e6e226b` — v0.8.1 release with corrected docs
