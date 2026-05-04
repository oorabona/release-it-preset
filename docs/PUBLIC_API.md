# Public API Surface — `@oorabona/release-it-preset`

This document defines what is **stable** in v1.0 (semver-protected) versus **internal** (subject to change without a major version bump). It is the contract you can rely on.

## Versioning policy (post-v1.0)

| Change kind | Version bump | Examples |
|---|---|---|
| Bug fix, doc update, transitive dep bump (internal) | `v1.0.x` (patch) | Fix a parser edge case, fix a typo, bump vitest |
| New stable item (additive) | `v1.x.0` (minor) | New utility command, new env var, new release config preset, new field on existing preset |
| Remove or rename a stable item; change semantic of a stable item; broaden allowed exit-code range | `v2.0.0` (major) | Drop a CLI command, rename an env var, change a preset's default behavior |

**Stable items are listed below. Anything not listed is internal and may change in any version.**

---

## Stable CLI commands

The `release-it-preset` binary (or `pnpm release-it-preset`) accepts these commands. All are documented in the README's CLI section and tested against the published surface.

### Release commands (spawn `release-it` with the matching config)

| Command | Config file | Use case |
|---|---|---|
| `default` | `config/default.js` | Standard release: changelog auto-population + git + GitHub + npm |
| `hotfix` | `config/hotfix.js` | Emergency patch; changelog generated from commits |
| `changelog-only` | `config/changelog-only.js` | Update CHANGELOG only; no version bump or release |
| `manual-changelog` | `config/manual-changelog.js` | Release with already-curated `[Unreleased]` content |
| `no-changelog` | `config/no-changelog.js` | Release without touching CHANGELOG |
| `republish` | `config/republish.js` | Move existing tag + update GitHub release. Does not publish to npm (immutable registry — see [ADR 0005](adr/0005-republish-scope-narrowing.md)). |
| `retry-publish` | `config/retry-publish.js` | Retry failed npm/GitHub publish without git operations |

### Utility commands (run dedicated scripts)

| Command | Script | Use case |
|---|---|---|
| `init` | `init-project` | Bootstrap CHANGELOG.md + `.release-it.json` extends |
| `update` | `populate-unreleased-changelog` | Fill `[Unreleased]` from commits since last tag |
| `validate` | `validate-release` | Pre-release readiness check (exit 2 on precondition failure) |
| `check` | `check-config` | Verbose dump of env vars + git/npm state |
| `doctor` | `doctor` | Structured diagnostic: 4-section checklist + `--json` output, exit 1 on BLOCKED |
| `check-pr` | `check-pr-status` | PR hygiene checks for GitHub Actions consumption |
| `retry-publish-preflight` | `retry-publish` (preflight mode) | Pre-flight checks before retry-publish runs |

All commands accept `--ci`, `--dry-run`, `--increment <patch\|minor\|major>`, `--preRelease <id>` flags pass-through to `release-it` (release commands) or interpreted by the script (utility commands).

---

## Stable environment variables

These env vars are read by configs and scripts. Setting them overrides built-in defaults. Unset = default.

### Changelog

| Name | Default | Notes |
|---|---|---|
| `CHANGELOG_FILE` | `CHANGELOG.md` | Path to changelog file |
| `GIT_CHANGELOG_PATH` | _(unset)_ | Repository-relative path to scope `git log` (monorepo per-package CHANGELOG); validated against absolute paths, `..` traversal, shell metacharacters |
| `GIT_CHANGELOG_SINCE` | _(unset)_ | Override the `since` baseline (any git ref: SHA, tag, branch); bypasses per-package release-commit detection and `git describe --tags` fallback |
| `GIT_CHANGELOG_COMMAND` | _(unset)_ | Override the `git log` command used for release-it's release-preview |
| `GIT_CHANGELOG_DESCRIBE_COMMAND` | `git describe --tags --abbrev=0` | Override the latest-tag detection command |
| `CHANGELOG_TYPE_MAP` | _(unset)_ | JSON string overriding the built-in commit-type → CHANGELOG section map. Highest priority (overrides `.changelog-types.json` file and built-in defaults). Example: `{"deps":"### Dependencies"}` |

### Git

| Name | Default | Notes |
|---|---|---|
| `GIT_COMMIT_MESSAGE` | `chore(release): v${version}` | Release commit template (`hotfix` preset defaults to `chore(hotfix): v${version}`, `republish` to `chore: republish v${version}`; set this env var to override across all presets) |
| `GIT_TAG_NAME` | `v${version}` | Tag template |
| `GIT_REQUIRE_BRANCH` | `main` | Required branch for releases |
| `GIT_REQUIRE_UPSTREAM` | `false` | Require upstream tracking (`true`/`false`) |
| `GIT_REQUIRE_CLEAN` | `false` | Require clean working tree |
| `GIT_REMOTE` | `origin` | Git remote name |

### npm

| Name | Default | Notes |
|---|---|---|
| `NPM_PUBLISH` | `false` | Set to `true` to enable `npm publish` (off-by-default for safety). **Not honored by `republish` preset** — that preset hardcodes `publish: false` (see [ADR 0005](adr/0005-republish-scope-narrowing.md)). |
| `NPM_SKIP_CHECKS` | `false` | Skip `npm whoami` precheck (set to `true` under OIDC trusted publishing) |
| `NPM_ACCESS` | `public` | npm `--access` value |
| `NPM_TAG` | _(unset)_ | When set, appended as `--tag <value>` to npm publish (used by smart dist-tag selection in `publish.yml`) |

### GitHub

| Name | Default | Notes |
|---|---|---|
| `GITHUB_RELEASE` | `false` | Set to `true` to create a GitHub Release |
| `GITHUB_REPOSITORY` | _(unset, auto-detected from git remote)_ | `owner/repo` for commit/release links |

### Hotfix

| Name | Default | Notes |
|---|---|---|
| `HOTFIX_INCREMENT` | `patch` | Version increment for the `hotfix` config (`patch`/`minor`/`major`/`prepatch`/`preminor`/`premajor`/`prerelease`) |

### `check-pr` utility

| Name | Default | Notes |
|---|---|---|
| `PR_BASE_REF` | _(falls back to `GITHUB_BASE_REF` then `origin/main`)_ | Base ref for the PR diff (used by `release-it-preset check-pr`) |
| `PR_HEAD_REF` | _(falls back to `GITHUB_HEAD_REF` then `HEAD`)_ | Head ref for the PR diff |

### Project file (lower priority than `CHANGELOG_TYPE_MAP` env var)

| File | Notes |
|---|---|
| `.changelog-types.json` | Project-level commit-type → CHANGELOG section map override. Resolution: env var > this file > built-in defaults. |

---

## Stable config exports

The package exports release-it preset configs that you can `extends` from your `.release-it.json`:

```json
{
  "extends": "@oorabona/release-it-preset/config/default"
}
```

| Export path | Maps to |
|---|---|
| `@oorabona/release-it-preset/config/default` | `config/default.js` |
| `@oorabona/release-it-preset/config/hotfix` | `config/hotfix.js` |
| `@oorabona/release-it-preset/config/changelog-only` | `config/changelog-only.js` |
| `@oorabona/release-it-preset/config/manual-changelog` | `config/manual-changelog.js` |
| `@oorabona/release-it-preset/config/no-changelog` | `config/no-changelog.js` |
| `@oorabona/release-it-preset/config/republish` | `config/republish.js` |
| `@oorabona/release-it-preset/config/retry-publish` | `config/retry-publish.js` |

The shape of each exported config object is the standard release-it config schema; we add no custom fields beyond what release-it documents.

---

## Stable GitHub Actions workflows

Reusable workflows under `.github/workflows/` are publishable surface (importable via `workflow_call`). The publish surface is:

| Workflow | Inputs | Notes |
|---|---|---|
| `publish.yml` | `tag`, `npm_only`, `github_only`, `dist_tag` | npm OIDC trusted publishing + GitHub release. Triggered on `push: tags v*`, `workflow_call`, `workflow_dispatch`. |

Workflow internals (job structure, step ordering, `runs-on`) may change in any version. The **inputs** are the contract.

---

## Exit code stability

CLI exit codes follow this convention:

| Code | Meaning | Examples |
|---|---|---|
| `0` | Success | Command completed; for `doctor`, `READY` or `WARNINGS` status |
| `1` | General failure | Unhandled error, validation failure, `doctor` `BLOCKED` status |
| `2` | Precondition failure (CI-friendly) | `validate` reports CHANGELOG missing or `[Unreleased]` empty |
| `3..9` | **Reserved** | Not currently used; reserved for future contract additions |

Scripts use `ScriptError`/`ValidationError`/`GitError`/`ChangelogError` (typed error hierarchy in `scripts/lib/errors.ts`) to differentiate failure modes; the typed error is internal but the exit-code contract above is stable.

**Breaking change in a future major would** introduce semantic for codes 3-9 OR change the meaning of 0/1/2.

---

## Internal — subject to change

The following are **NOT** stable. Do not depend on their shape, location, or behavior across versions:

- `scripts/lib/*` (helper modules: `git-utils`, `commit-parser`, `semver-utils`, `string-utils`, `changelog-types`, `errors`, `run-script`)
- **Individual `scripts/<command>.ts` exports beyond the CLI surface** — `package.json` exports `./scripts/*` to expose `dist/scripts/*.js`, but consuming those modules programmatically (e.g., `import { populateChangelog } from '@oorabona/release-it-preset/scripts/populate-unreleased-changelog'`) is **exported-but-unstable**: the module-level exports may rename, change signatures, or move between minor versions. Use the CLI commands (`release-it-preset update`, etc.) for stable behavior.
- TypeScript declaration files in `dist/types/*` — emitted for editor experience, signature shapes may evolve
- `bin/validators.js` internals (validators are still applied to user input but their function signatures may change)
- The DI dependency interfaces (`PopulateChangelogDeps`, `GitDeps`, `DoctorDeps`, etc.) — used internally for testing
- The repo layout under `dist/` beyond `dist/scripts/` and `dist/types/`

If you find yourself importing from `scripts/lib/*.js`, `dist/types/*`, or `@oorabona/release-it-preset/scripts/*` programmatically, you have stepped outside the stable API. Open an issue requesting the surface area you need and we can promote it to stable in a minor version.

---

## How to know if a change broke the contract

Before publishing a major or minor version:

1. Run `pnpm exec release-it-preset doctor --json` against a fresh checkout of the release tag — should produce the same shape.
2. Verify each `RELEASE_CONFIG` entry in `bin/cli.js` resolves to a file present in `config/`.
3. Verify each `UTILITY_COMMAND` entry resolves to a script present in `dist/scripts/`.
4. Verify the env-var catalog in `scripts/doctor.ts` (`ENV_VAR_CATALOG`) matches the list in this document.
5. Verify the workflow input contract in `publish.yml` is unchanged.

If any of (2), (3), (4), (5) require a contract change, that's a major version bump.

---

## See also

- [Versioning notes in MIGRATION.md](./MIGRATION.md) for version-by-version breaking changes (pre-v1.0 era).
- [README — Why this preset?](../README.md#why-this-preset) for the positioning narrative.
- [CONTRIBUTING.md](../CONTRIBUTING.md) for how to propose new stable items.
