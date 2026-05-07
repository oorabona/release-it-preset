# ADR-0006: Relaxed extends/preset mismatch policy

## Status

Accepted (2026-05-07). Supersedes the second invariant of [ADR-0002](./0002-strict-extends-validation.md) ("hard-error on mismatch"). Retains ADR-0002's first invariant (`extends` is required).

## Context

ADR-0002 codified hard-erroring on extends/preset mismatch (e.g. `.release-it.json` extends `default`, user invokes `release-it-preset retry-publish`). In practice this proved too strict:

- Operational presets (`retry-publish`, `republish`) and alternate-flow presets (`no-changelog`, `manual-changelog`) are most useful **on top of** an existing extended config; forcing the user to maintain a matching `.release-it.json` per preset is friction.
- Our own generated `init --with-workflows` template was driven into a `release-it --config $(node -e require.resolve(...))` workaround pattern just to bypass the CLI — a clear smell that the CLI's contract was over-constrained.
- The original decision lacked an escape hatch: even an explicit `--config <path>` couldn't override the assertion.

## Decision

When `.release-it.json` extends preset X and the user invokes preset Y (Y ≠ X):

1. Print a warning naming both presets and the recovery command (`release-it-preset <X>`).
2. Pass `--config <Y-path>` to release-it so the invoked preset's config wins; the user's `.release-it.json` customizations are skipped for that run.
3. Continue execution (no exit-1).

The `extends`-required check (ADR-0002 first invariant) remains in place: a `.release-it.json` without `extends` still hard-errors, because the user clearly intended preset semantics but didn't wire them up.

## Consequences

- **Pro**: operational and alternate-flow presets are usable from any extended config without editing `.release-it.json`. Generated workflow template simplifies to `pnpm exec release-it-preset retry-publish --ci`.
- **Pro**: the warning surfaces the override transparently — users see exactly when their customizations are ignored and how to keep them.
- **Con (mitigated)**: tooling that relied on exit-1 mismatch as a signal must now parse the warning prefix or pre-check `extends`. Captured in CHANGELOG `### Changed`.
- **Reverses** the ADR-0002 second invariant. Does not affect any other decision.

## Alternatives considered

- Whitelist of "operational" presets (retry-publish/republish/hotfix) bypassing the check: rejected because the operational/shape distinction is artificial — `no-changelog` and `manual-changelog` are also legitimate "I want to do this run differently" cases.
- Keep the strict check, push the workaround pattern into the template forever: rejected because the workaround is a smell pointing back at the CLI being over-constrained.
- Drop the `extends`-required check too: rejected because the missing-extends footgun (user creates an empty `.release-it.json` thinking they're overriding when they're actually getting release-it defaults) is the load-bearing safety net. Mismatch was not.
