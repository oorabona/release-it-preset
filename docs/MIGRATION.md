# Migration Guide

This document describes how to upgrade `@oorabona/release-it-preset` between
major and minor versions. Most upgrades within v0.x are non-breaking; the
exceptions are listed below.

## Quick reference

| From → To       | Breaking? | Action required                                                          |
|-----------------|-----------|--------------------------------------------------------------------------|
| 0.7.x → 0.8.0   | partial   | Remove `extends` from `.release-it.json` per old docs — then read 0.8.1 |
| 0.8.0 → 0.8.1   | yes       | Add `extends` back to `.release-it.json` (see below)                    |
| 0.8.x → 0.9.0   | no        | Optional: use zero-config mode or monorepo parent references             |
| 0.9.x → 0.10.0  | yes       | Update CI scripts that branch on `validate` exit code (`1` → `2`)       |
| 0.10.0 → 0.10.1 | no        | Strict commit-msg hooks now accept the new default release commit format |
| 0.10.x → 0.11.0 | no        | Two new optional env vars (`GIT_CHANGELOG_PATH`, `NPM_TAG`)              |
| 0.x → 1.0       | partial   | API freeze shipped in v1.0.0-rc.0; see [Upgrade checklist for v1.0.0](#upgrade-checklist-for-v100) |

---

## Detailed migration steps

### 0.7.x → 0.8.0 / 0.8.1 — Strict `extends` validation

**Background.** v0.8.0 shipped validation that checked the `extends` field in
`.release-it.json`, but its documentation incorrectly described "Mode 2" —
running without `extends` — as supported. v0.8.1 corrected this: `extends` is
required whenever `.release-it.json` exists. Commit `c3cb04f` introduced the
enforcement; commit `e6e226b` shipped the corrected docs.

**Why it matters.** Without `extends`, release-it reads only `.release-it.json`
and falls back to release-it's own defaults instead of the preset's. The
visible symptoms are:

- `npm.publish` defaults to `true` (preset default: `false`) — risk of
  accidental publishes.
- Changelog automation hooks (`populate-unreleased-changelog`,
  `republish-changelog`) are not executed.
- GitHub release settings from the preset are ignored.

**What to do.** Ensure `.release-it.json` declares `extends`:

```json
{
  "extends": "@oorabona/release-it-preset/config/default",
  "git": {
    "requireBranch": "main"
  }
}
```

Replace `default` with the preset you use (`hotfix`, `no-changelog`, etc.).
The `extends` value must match the CLI command you invoke
(`release-it-preset default` → `…/config/default`).

If you have no overrides, remove `.release-it.json` entirely and rely on the
CLI preset directly.

---

### 0.9.x → 0.10.0 — `validate` exit code change (BREAKING)

Pre-flight failures from `release-it-preset validate` now exit with code **2**
(was `1`). Exit code `1` is reserved for unexpected runtime errors. Exit
code `2` signals a failed precondition. Affected conditions: missing
`CHANGELOG.md`, empty `[Unreleased]` section, wrong branch, dirty working
tree, missing npm authentication.

Commit `6483e5d` introduced the typed error hierarchy (`ValidationError` →
exit 2, `GitError` / `ChangelogError` → exit 1) and the `runScript()` wrapper
that maps errors to exit codes.

**Action required.** If your CI scripts assert a specific exit code from
`validate`, update the check:

```bash
# Before (0.9.x)
release-it-preset validate
if [ $? -eq 1 ]; then
  echo "Validation failed"
fi

# After (0.10.0+) — recommended: treat any non-zero as failure
release-it-preset validate
if [ $? -ne 0 ]; then
  echo "Validation failed (exit $?)"
fi

# Or distinguish precondition errors from runtime errors:
release-it-preset validate
EXIT=$?
if [ $EXIT -eq 2 ]; then
  echo "Pre-flight check failed"
elif [ $EXIT -eq 1 ]; then
  echo "Runtime error"
fi
```

The following `validate` checks now exit with code `2` specifically:
- `CHANGELOG.md` not found
- `[Unreleased]` section empty or missing
- Working tree dirty (when `--allow-dirty` is not passed)
- Current branch does not match `GIT_REQUIRE_BRANCH`
- `npm whoami` fails (missing npm authentication)

---

### 0.10.0 → 0.10.1 — Default commit message format

This release fixed the default `GIT_COMMIT_MESSAGE` from
`release: bump v${version}` to `chore(release): v${version}`, and the
hotfix default from `hotfix: bump v${version}` to `chore(hotfix): v${version}`.
Commit `affe211` applied the fix in `config/constants.js`.

The previous defaults were rejected by strict commit-msg hooks (e.g. commitlint
with the `@commitlint/config-conventional` ruleset) because `release` and
`hotfix` are not recognized Conventional Commits types.

Changelog filters in `populate-unreleased-changelog` and
`DEFAULT_CHANGELOG_COMMAND` were updated in the same commit to skip both the
old (`^release`, `^hotfix`) and new (`^chore(release)`, `^chore(hotfix)`)
patterns so release commits are not included in generated changelogs.

**Users who explicitly set `GIT_COMMIT_MESSAGE` are unaffected.**

If you relied on the old default message format in CI patterns or audit logs,
update those patterns.

---

### 0.10.x → 0.11.0 — Optional env vars

Two new opt-in environment variables are available:

- **`GIT_CHANGELOG_PATH`** — Scopes changelog path for monorepo per-package
  use. When set, scripts read and write the changelog at this path instead of
  the value of `CHANGELOG_FILE`. Defaults to unset (no behaviour change).
- **`NPM_TAG`** — Assigns a named npm dist-tag on publish (e.g. `--tag next`).
  When set, the compiled `publishArgs` include `--tag <value>`. Useful for
  republishing an older version without overwriting the `latest` tag. Defaults
  to unset.

No existing configuration is affected. Both vars require explicit opt-in.

---

## Upgrade checklist for v1.0.0

v1.0 freezes the public API surface: config export paths, CLI commands and
flags, environment variable names, exit codes, and the `extends` contract.
The full surface is documented in [`docs/PUBLIC_API.md`](./PUBLIC_API.md).

The path to v1.0.0 stable runs `v0.13.0` (multi-line body parser fix) →
`v0.14.0` (workflows OIDC parity) → `v0.15.0` (doctor + configurable
commit-type-map) → `v1.0.0-rc.0` (freeze + OSS hygiene + announce) →
`v1.0.0` stable. There is **no `beta` phase** — integrators concerned about
the contract should test against `v1.0.0-rc.0`.

Once v1.0.0 is out, standard semver discipline applies: breaking changes
require a major version bump. The v0.x series does not provide a formal
backport policy.

**Pre-v1.0 checklist:**

- [ ] Ensure `.release-it.json` declares `extends` (required since v0.8.1)
- [ ] Confirm CI does not assert `$? -eq 1` from `validate` (exit 2 since
      v0.10.0)
- [ ] Verify commit-msg hooks accept `chore(release): v${version}` (default
      since v0.10.1)
- [ ] Audit any env vars you set against [`docs/PUBLIC_API.md`](./PUBLIC_API.md)
      — names have been stable since v0.7.0
- [ ] Run `release-it-preset doctor` (new in v0.15.0) to confirm the preset
      resolves correctly in your environment

## v1.0 stability commitments

The contract listed in [`docs/PUBLIC_API.md`](./PUBLIC_API.md) is what we
freeze in v1.0.0. To recap:

- **Stable**: 7 release configs (`default`/`hotfix`/`changelog-only`/
  `manual-changelog`/`no-changelog`/`republish`/`retry-publish`), 7 utility
  commands (`init`/`update`/`validate`/`check`/`doctor`/`check-pr`/
  `retry-publish-preflight`), 18 environment variables (17 in
  `ENV_VAR_CATALOG` + `CHANGELOG_TYPE_MAP`), 7 config exports under
  `@oorabona/release-it-preset/config/*`, the `publish.yml` workflow input
  contract, and the `release-it ^19 || ^20` peer dep range.
- **Internal** (may change without notice): `scripts/lib/*`, individual
  script exports beyond the CLI surface, `dist/types/*`, DI dependency
  interfaces, the `bin/validators.js` internals.

If a future release needs to touch any stable item, it requires a major
version bump (`v2.0.0`).

## Exit code stability

CLI exit codes follow this convention from v1.0.0 onward:

| Code | Meaning |
|---|---|
| `0` | Success (`doctor` `READY` or `WARNINGS` status; commands completed) |
| `1` | General failure (unhandled error, validation failure, `doctor` `BLOCKED` status) |
| `2` | Precondition failure for CI (`validate` reports CHANGELOG missing or `[Unreleased]` empty) |
| `3..9` | **Reserved** — not currently emitted; reserved for future contract additions |

Scripts use a typed error hierarchy (`ScriptError` / `ValidationError` /
`GitError` / `ChangelogError`) under the hood; the typed errors are
internal but the exit-code contract above is stable.
