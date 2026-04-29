# ADR-0004: Conventional Commits format for default release messages

- **Status**: Accepted
- **Date**: 2026-04-29
- **Deciders**: maintainers

## Context

`release-it` generates a git commit when it bumps a version. The commit message
is configurable via `git.commitMessage` in the release-it config. The preset's
`config/constants.js` sets a default used when the user does not provide a
`GIT_COMMIT_MESSAGE` environment variable.

In v0.10.0, the defaults were:

- `GIT_DEFAULTS.COMMIT_MESSAGE`: `release: bump v${version}`
- `HOTFIX_DEFAULTS.COMMIT_MESSAGE`: `hotfix: bump v${version}`

After shipping v0.10.0 and running the preset against itself (dogfooding), the
release commit `release: bump v0.10.0` was rejected by the project's own
commit-msg hook. The hook enforces the
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
specification via commitlint with `@commitlint/config-conventional`. The
`release` and `hotfix` tokens are not recognized Conventional Commits types.

The recognized types in the conventional preset are: `build`, `chore`, `ci`,
`docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. A
version-bump commit is a maintenance operation with no user-visible behaviour
change: `chore` is the correct type.

A secondary problem arose simultaneously: `populate-unreleased-changelog`
filters out release commits from the generated `[Unreleased]` section. The
filters were written to skip `^release` and `^hotfix` prefixes. After changing
the default message format, the new `chore(release):` prefix would not be
filtered, causing the v0.10.0 release commit to appear in v0.11.0's changelog.
Both the script filter and `DEFAULT_CHANGELOG_COMMAND` (used by release-it's
built-in preview) needed updating together.

## Decision

In `config/constants.js` (commit `affe211`):

- `GIT_DEFAULTS.COMMIT_MESSAGE` changed from `release: bump v${version}` to
  `chore(release): v${version}`
- `HOTFIX_DEFAULTS.COMMIT_MESSAGE` (used by `config/hotfix.js`) changed from
  `hotfix: bump v${version}` to `chore(hotfix): v${version}`

In the same commit, `DEFAULT_CHANGELOG_COMMAND` was extended with two
additional `--grep` flags:

```
--grep="^chore(release)"
--grep="^chore(hotfix)"
--grep="^chore(ci)"
```

These complement the existing `^release`, `^hotfix`, `^ci` patterns so both
the legacy format and the new Conventional Commits format are filtered.

`populate-unreleased-changelog.ts` was updated to skip commits matching the new
patterns in addition to the legacy ones.

Users who explicitly set `GIT_COMMIT_MESSAGE` via environment variable are
unaffected by this change — the env var takes precedence over the constant.

## Alternatives considered

- **Keep `release:` and document the workaround**: Users with strict commit-msg
  hooks would need to set `GIT_COMMIT_MESSAGE` to a compliant value. This
  shifts the burden to every user with strict hooks and contradicts the preset's
  goal of working out-of-the-box. Rejected.
- **Add `release` and `hotfix` to the allowed Conventional Commits types via a
  custom commitlint config**: Out of scope for this package — it would require
  the preset to also configure commitlint, which is a separate tool with its
  own ecosystem. The Conventional Commits spec reserves type names; adding
  custom types is a per-project decision, not a preset's. Rejected.
- **Use `chore:` without a scope**: `chore: v0.11.0` is valid Conventional
  Commits but less specific. Including the scope (`chore(release): ...`) makes
  the commit purpose explicit in git log and provides a stable grep target for
  the changelog filter. Accepted as better than bare `chore:`.
- **Use `release(chore): ...` (reversed order)**: Not a valid Conventional
  Commits structure (type must be a recognized token, not `release`).
  Rejected.

## Consequences

- **Positive**: Default release commits pass strict `@commitlint/config-conventional`
  hooks without any user configuration. The preset works out-of-the-box in
  projects with commit-msg enforcement.
- **Positive**: `chore(release):` and `chore(hotfix):` are filtered from
  generated changelogs by both the script and `DEFAULT_CHANGELOG_COMMAND`,
  preserving changelog cleanliness.
- **Negative**: Projects that relied on the previous default message format
  (`release: bump v${version}`) in audit logs, git grep patterns, or CI
  scripts will see different message text. Users who explicitly set
  `GIT_COMMIT_MESSAGE` are unaffected.
- **Neutral**: The new format is slightly shorter (`chore(release): v0.11.0`
  vs `release: bump v0.11.0`). Both are human-readable in `git log`.

## References

- `config/constants.js` — `GIT_DEFAULTS.COMMIT_MESSAGE`, `DEFAULT_CHANGELOG_COMMAND`
- `config/hotfix.js` — uses `HOTFIX_DEFAULTS.COMMIT_MESSAGE` via `createBaseGitConfig`
- `scripts/populate-unreleased-changelog.ts` — skip filters for release commits
- CHANGELOG.md v0.10.1
- Commit `affe211` — fix Conventional Commits compliance in default messages
- Conventional Commits 1.0.0 specification: https://www.conventionalcommits.org/en/v1.0.0/
