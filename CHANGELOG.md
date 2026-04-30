# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.13.1] - 2026-04-30

### Fixed

- **npm dist-tag selection for pre-releases** — `publish.yml` was tagging pre-release versions (`1.0.0-beta.1`, `2.0.0-rc.2`, etc.) as `latest` because `sort -V` places them after stable versions. The new branch in the smart dist-tag step extracts the prerelease identifier (`1.0.0-beta.1` → `beta`, `1.5.0-alpha.5` → `alpha`) and uses it as the npm tag, leaving `latest` on the prior stable release. Build metadata (`+build.123`) is stripped before detection so versions like `1.0.0+build-foo` (legal semver, build hyphen but no prerelease) correctly fall through to the stable path. Unblocks the v1.0.0-beta.X / rc.X cycle. ([025a5f9](https://github.com/oorabona/release-it-preset/commit/025a5f9))

## [0.13.0] - 2026-04-30

### Fixed

- **Multi-line commit body parser** — `populate-unreleased-changelog` now restricts conventional-commit scanning to the **header block** (lines before the first blank line), preventing paragraph-separated trailers like `Refs: #42`, `Co-authored-by:`, etc. from leaking as spurious `### Changed` entries. AC#5 multi-prefix on consecutive lines (`feat: x\nfix: y`) is preserved. Adds explicit `BREAKING CHANGE:` footer detection — promotes the first emitted part to breaking, or emits a standalone `misc` breaking entry when no leading conventional prefix is present. Closes [#23](https://github.com/oorabona/release-it-preset/issues/23). ([9ff76aa](https://github.com/oorabona/release-it-preset/commit/9ff76aa))

### Changed

- **npm package metadata** — expanded `keywords` array and refined `description` field for better npm registry / search discoverability. ([9b7eb42](https://github.com/oorabona/release-it-preset/commit/9b7eb42))

## [0.12.0] - 2026-04-30

### Added

- **`GIT_CHANGELOG_SINCE` env var** — explicit `since` baseline override for changelog generation (any git ref: SHA, tag, branch). When set, bypasses both the per-package release-commit detection and the `git describe --tags` fallback. Useful for monorepo workspaces with non-standard release commit patterns. ([d117cad](https://github.com/oorabona/release-it-preset/commit/d117cad))
- **Per-package release commit auto-detection** — when `GIT_CHANGELOG_PATH` is set, `populate-unreleased-changelog` now reads `package.json` `.name` (strips `@scope/` prefix), runs `git log --grep="^chore(<pkg>): release v" -n 1` and uses the SHA as the `since` baseline if found. Falls back to `git describe --tags` when no prior per-package release commit exists. Eliminates re-printing of commits already shipped in earlier per-package releases. Closes [#21](https://github.com/oorabona/release-it-preset/issues/21). ([d117cad](https://github.com/oorabona/release-it-preset/commit/d117cad))

### Changed

- **CI infrastructure modernized**: bumped `actions/checkout` 4 → 6 ([3061d00](https://github.com/oorabona/release-it-preset/commit/3061d00)), `actions/cache` 4 → 5 ([3c790c8](https://github.com/oorabona/release-it-preset/commit/3c790c8)), `pnpm/action-setup` 4 → 6 ([f551072](https://github.com/oorabona/release-it-preset/commit/f551072)). Aligns with current GitHub Actions runner expectations.
- **Dependabot config consolidated** — weekly grouped updates for dev/prod dependencies, separate `github-actions` ecosystem tracking, Conventional Commits prefixes (`chore(deps)` / `chore(actions)`). One PR per week instead of N. ([f12c7fb](https://github.com/oorabona/release-it-preset/commit/f12c7fb))

### Fixed

- **E2E test helper** isolates spawned CLI from CI runner env vars — `runCli()` now forces `GITHUB_REPOSITORY=''` so `getGitHubRepoUrl()` falls back to the temp repo's configured `origin` remote rather than the CI runner's auto-set value. Fixed a flaky E2E assertion that passed locally but failed under GitHub Actions. ([85ce9a6](https://github.com/oorabona/release-it-preset/commit/85ce9a6))

## [0.11.0] - 2026-04-29

### Added

- **`GIT_CHANGELOG_PATH` env var** for monorepo per-package changelog scoping. When set to a repository-relative path (e.g. `packages/tar-xz`), `populate-unreleased-changelog` filters the underlying `git log` to commits touching that subtree, eliminating cross-package noise in monorepo workflows. Path is validated against absolute paths, `..` traversal, and shell metacharacters; invalid values throw `ValidationError`. Empty / unset preserves repository-wide behavior. ([ee81e7d](https://github.com/oorabona/release-it-preset/commit/ee81e7d))
- **`NPM_TAG` env var support** in `createBaseNpmConfig()`. When set, `--tag <value>` is appended to npm publish args. Used by the publish workflow to auto-assign version-named dist-tags when republishing older versions, so `latest` is not overwritten. ([ad40152](https://github.com/oorabona/release-it-preset/commit/ad40152))
- **[`docs/MIGRATION.md`](docs/MIGRATION.md)** — version-by-version upgrade guide with breaking-change details and CI script update notes (covers 0.7 → 0.8, 0.9 → 0.10, 0.10 → 0.10.1, 0.10 → 0.11). ([7841605](https://github.com/oorabona/release-it-preset/commit/7841605))
- **[`docs/adr/`](docs/adr/)** — initial Architecture Decision Records covering peer-dependency rationale, strict `extends` validation, the Dependency Injection script pattern, and the Conventional Commits default for release messages.
- **`bin/cli.js` in vitest coverage report**. Subprocess instrumentation is not auto-attached so coverage may report 0% for now, but the file is now visible in the report rather than hidden. ([4a13219](https://github.com/oorabona/release-it-preset/commit/4a13219))

### Changed

- **Unified publish workflow**: `retry-publish.yml` was merged into `publish.yml`. The unified workflow accepts `push: tags`, `workflow_call`, and `workflow_dispatch` triggers, plus `tag` / `npm_only` / `github_only` / `dist_tag` inputs for partial replays. Manual replay: `gh workflow run publish.yml --ref main -f tag=vX.Y.Z`. ([8324918](https://github.com/oorabona/release-it-preset/commit/8324918))
- **npm OIDC trusted publishing**: publish workflow no longer requires an `NPM_TOKEN` secret. The npm CLI handles authentication at publish time via the GitHub Actions id-token. Node bumped to 24 (npm ≥ 11.5.1 needed for OIDC handshake). `NPM_SKIP_CHECKS=true` bypasses release-it's `npm whoami` precheck which has no static identity to verify under OIDC. ([560eaba](https://github.com/oorabona/release-it-preset/commit/560eaba))
- **Smart npm `dist-tag` selection**: the publish workflow now compares the version being published with the current `latest` on the registry and selects:
  - `latest` when newer than (or equal to) the current `latest`,
  - `v<version>` (a version-named tag) when older — so backfilling an older release does not demote `latest`.
  Override via the `dist_tag` workflow input. ([ad40152](https://github.com/oorabona/release-it-preset/commit/ad40152))
- **Idempotent publish**: when a version is already on the npm registry, the publish step is skipped gracefully (rather than failing with `cannot publish over existing versions`); the GitHub release update step still runs. ([10d8ce5](https://github.com/oorabona/release-it-preset/commit/10d8ce5))

### Internal

- README.md and CLAUDE.md environment-variable sections updated to document `GIT_CHANGELOG_PATH` and `NPM_TAG`. ([7841605](https://github.com/oorabona/release-it-preset/commit/7841605))

## [0.10.1] - 2026-04-29

### Fixed

- **Default release commit messages are now Conventional Commits compliant.** `GIT_DEFAULTS.COMMIT_MESSAGE` changed from `release: bump v${version}` to `chore(release): v${version}`, and `HOTFIX_COMMIT_MESSAGE` from `hotfix: bump v${version}` to `chore(hotfix): v${version}`. The previous defaults were rejected by strict commit-msg hooks since `release` and `hotfix` are not recognized Conventional Commits types. Discovered while dogfooding v0.10.0. Users who explicitly set `GIT_COMMIT_MESSAGE` are unaffected.
- **Changelog filters updated** to recognize the new release commit format. `populate-unreleased-changelog` now skips commits matching `^chore(release)`, `^chore(hotfix)`, and `^chore(ci)` in addition to the legacy `^release`, `^hotfix`, `^ci` prefixes. `DEFAULT_CHANGELOG_COMMAND` (used by release-it preview) gets the matching grep flags. Without this, the v0.10.0 release commit would have polluted v0.11.0's `[Unreleased]` section.

## [0.10.0] - 2026-04-29

### ⚠️ BREAKING CHANGES

- `release-it-preset validate` now exits with code **2** (was `1`) when a precondition fails (missing `CHANGELOG.md`, empty `[Unreleased]`, wrong branch, dirty tree, missing npm auth). Other failure paths still exit `1`. Update CI scripts asserting `exitCode === 1`. ([6483e5d](https://github.com/oorabona/release-it-preset/commit/6483e5d))

### Added

- **Typed error hierarchy for scripts**: `ScriptError` base + `ValidationError` (exit 2), `GitError` (exit 1), `ChangelogError` (exit 1) in `scripts/lib/errors.ts`. New `runScript()` wrapper in `scripts/lib/run-script.ts` standardizes exit-code mapping across all 8 main scripts. ([6483e5d](https://github.com/oorabona/release-it-preset/commit/6483e5d))
- **E2E test suite** under `tests/e2e/` with a real git temp-repo helper (`tests/helpers/temp-repo.ts`). Eight tests cover populate-changelog, validate, and retry-publish-preflight against real git operations — no mocks. New `pnpm test:e2e` script. ([467cca0](https://github.com/oorabona/release-it-preset/commit/467cca0))
- **Security policy** ([`SECURITY.md`](SECURITY.md)) with private-advisory disclosure channel, supported-version matrix, and acknowledgement / triage / disclosure SLAs. ([7c9b16f](https://github.com/oorabona/release-it-preset/commit/7c9b16f))
- **Dependency audit workflow** (`.github/workflows/audit.yml`) running `pnpm audit --prod --audit-level=high` on every PR + weekly cron, with a full-tree advisory step for transitive issues. README badge added. ([7c9b16f](https://github.com/oorabona/release-it-preset/commit/7c9b16f))
- **Contributor documentation**: [`CLAUDE.md`](CLAUDE.md) (architecture + CLI/config/script reference), [`docs/testing.md`](docs/testing.md) (DI pattern + E2E helper + error-handling pattern), [`BACKLOG_STUDY.md`](BACKLOG_STUDY.md) (post-v1 ideas), [`docs/archive/`](docs/archive/) (frozen roadmap snapshots with policy). ([6fde0cf](https://github.com/oorabona/release-it-preset/commit/6fde0cf))

### Changed

- **Dev tooling bumped to latest**: TypeScript 5.9 → 6.0, Vitest 3 → 4, `@vitest/coverage-v8` 3 → 4, `@biomejs/biome` 2.2 → 2.4, `@types/node` 22 → 25, `tsx` 4.20 → 4.21, `nano-staged` 0.8 → 1.0, `rimraf` 6.0 → 6.1. ([d24df9a](https://github.com/oorabona/release-it-preset/commit/d24df9a))
- **Peer contract aligned**: `peerDependencies.release-it` `^19.0.0` → `^20.0.0` (matches the version the preset is now developed and tested against). ([d24df9a](https://github.com/oorabona/release-it-preset/commit/d24df9a))
- `tsconfig.json` now sets an explicit `"rootDir": "./scripts"` (required by TypeScript 6 when `outDir` is set). ([d24df9a](https://github.com/oorabona/release-it-preset/commit/d24df9a))

### Internal

- TODO.md compacted from 506 lines to a < 40-line living roadmap; verbose pre-v0.9 history archived under [`docs/archive/TODO-2025-Q4.md`](docs/archive/TODO-2025-Q4.md) with a per-item resolution table.
- `.github/copilot-instructions.md` refreshed (release-config list, DI pattern for new scripts, removed stale runtime-dep claim).

## [0.9.0] - 2025-10-06

### Added

- **Zero-Config Mode**: Run `release-it-preset` without arguments to auto-detect preset from `.release-it.json` ([bin/cli.js](bin/cli.js))
  - Reads `.release-it.json` and extracts preset name from `extends` field
  - Follows industry standards (ESLint, TypeScript, Prettier)
  - Clear error messages when config is missing or misconfigured
  - Example: `pnpm release-it-preset` → auto-detects and runs configured preset

- **Passthrough Mode**: Use custom config files via `--config` flag ([bin/cli.js](bin/cli.js))
  - Bypass preset validation for advanced workflows
  - Support switching between multiple config files
  - Example: `pnpm release-it-preset --config .release-it-manual.json`
  - Enables easier preset switching without editing files

- **Monorepo Support**: Parent directory config references now allowed ([bin/validators.js](bin/validators.js))
  - Support `../../.release-it-base.json` style references (up to 5 levels)
  - Config file extension whitelist for security
  - Industry standard pattern (TypeScript, ESLint, Prettier all support this)
  - Defense-in-depth validation (extension check, depth limit, existence check)

- **CLI Mode Detection**: Automatic conflict detection between preset command and `--config` flag ([bin/cli.js](bin/cli.js))
  - Clear error when both preset and `--config` are specified
  - Guides user to choose correct approach

- **Documentation**: Comprehensive monorepo workflow guide ([examples/monorepo-workflow.md](examples/monorepo-workflow.md))
  - Step-by-step setup instructions
  - GitHub Actions integration examples
  - Security considerations
  - Troubleshooting guide

### Changed

- **CLI Help**: Updated to document 4 operating modes (zero-config, preset selection, passthrough, utility)
- **README.md**: New sections for Zero-Config Mode, Passthrough Mode, and Monorepo Support

### Removed

- **validatePath()**: Removed deprecated path validation function ([bin/validators.js](bin/validators.js))
  - Replaced by `validateConfigPath()` which provides monorepo support
  - No public API impact (function was never documented or exported publicly)
  - Use `validateConfigPath()` for all config file path validation

### Fixed

- **Monorepo Workflows**: Path traversal validation no longer blocks legitimate parent directory references
  - Previous versions blocked ALL `..` patterns (too strict)
  - Now allows up to 5 levels of parent traversal with security checks
  - Fixes compatibility with standard monorepo config patterns

### Security

- **Defense-in-Depth Validation**: Multiple security layers for config path validation
  - Extension whitelist (`.json`, `.js`, `.cjs`, `.mjs`, `.yaml`, `.yml`, `.toml`)
  - Depth limit (max 5 parent directory levels)
  - Absolute path blocking (must use relative paths)
  - File existence and type validation
- **OWASP Compliance**: Follows input validation and fail-secure principles
- **No Privilege Escalation**: Config files remain in trusted code boundary

### Migration Guide

**From v0.8.x to v0.9.0:**

No breaking changes! All existing workflows continue to work.

**New capabilities you can adopt:**

1. **Simplify your workflow** with zero-config mode:
   ```bash
   # Before (v0.8.x)
   pnpm release-it-preset default

   # After (v0.9.0) - shorter!
   pnpm release-it-preset
   ```

2. **Enable monorepo workflows** with parent config references:
   ```json
   {
     "extends": [
       "../../.release-it-base.json",
       "@oorabona/release-it-preset/config/default"
     ]
   }
   ```

3. **Switch presets easily** without editing config:
   ```bash
   # Create .release-it-manual.json once
   # Then switch with --config flag
   pnpm release-it-preset --config .release-it-manual.json
   ```

## [0.8.1] - 2025-10-06

### 🚨 CRITICAL BUG FIX

**If you upgraded to v0.8.0 and removed the `extends` field from `.release-it.json`, your configuration is BROKEN.**

#### What Happened

v0.8.0 incorrectly documented that the `extends` field was optional ("Mode 2" without extends). In reality, without `extends`, release-it only loads your `.release-it.json` and uses **release-it's own defaults** instead of the preset's defaults. This means:

- ❌ `npm.publish` defaults to `true` (should be `false` from preset)
- ❌ `github.release` settings ignored
- ❌ Hooks for changelog automation (`populate-unreleased-changelog`, `republish-changelog`) are **not executed**
- ❌ You get release-it defaults instead of preset defaults

**Risk:** Accidental npm publishes, missing changelog updates, incorrect release behavior.

#### How to Fix

**Add the `extends` field back to your `.release-it.json`:**

```json
{
  "extends": "@oorabona/release-it-preset/config/default",
  ...your overrides
}
```

Or **remove `.release-it.json`** entirely to use the preset directly via CLI.

#### Why This Fix

Configuration merging **only works** when `extends` is explicitly specified. This is consistent with all major configuration tools:
- ESLint requires `extends` in `.eslintrc`
- TypeScript requires `extends` in `tsconfig.json`
- Prettier config inheritance works the same way

Without `extends`, release-it/c12 has no way to know which preset to load and merge.

### Fixed

- **CLI now requires `extends` field** when `.release-it.json` exists ([bin/cli.js](bin/cli.js))
  - Clear error message guides users to add missing `extends`
  - Prevents silent misconfigurations that cause broken releases
  - Validates `extends` matches CLI preset name
- **Documentation updated** to reflect correct usage ([README.md](README.md), [examples/](examples/))
  - Removed incorrect "Mode 2 without extends" documentation
  - Clarified that `extends` is required for config merging
  - Added explanation of why `extends` is necessary

### Removed

- ❌ "Mode 2" (CLI preset + user config without extends) - **this never worked correctly**
- The preset now supports 2 modes instead of 3:
  - Mode 1: No config file (direct preset usage)
  - Mode 2: Config file with `extends` (preset + user overrides)

### Migration Guide

**If you're on v0.8.0 and followed the docs to remove `extends`:**

1. Add `extends` back to `.release-it.json`:
   ```json
   {
     "extends": "@oorabona/release-it-preset/config/default",
     "git": {
       "requireBranch": "master"  // your overrides
     }
   }
   ```

2. Or remove `.release-it.json` if you don't need overrides

**If you kept `extends` in v0.8.0:**
- ✅ No changes needed - your config already works correctly

## [0.8.0] - 2025-10-06

### Changed
- **CLI now validates `.release-it.json` extends field** ([bin/cli.js](bin/cli.js)):
  - If `extends` field exists, it must match the CLI preset command
  - Mismatch triggers clear error with 3 resolution options
  - **Recommended**: Use `.release-it.json` WITHOUT `extends` (Mode 2)
  - CLI preset + user overrides merge naturally via release-it/c12
- **Documentation restructured** with "Configuration Modes" section:
  - Mode 1: CLI only (no config file)
  - Mode 2: CLI + User Overrides (recommended) - config WITHOUT `extends`
  - Mode 3: File with Extends (advanced) - config WITH `extends`
  - Clear guidance on which mode to use for different scenarios

### Fixed
- Prevent silent misconfigurations where user's `.release-it.json extends` doesn't match CLI preset
- Error messages now provide actionable resolution steps

## [0.7.0] - 2025-10-06

### Added
- New `config/base-config.js` module with reusable configuration builders (`createBaseGitConfig`, `createBaseNpmConfig`, `createBaseGitHubConfig`)
- New `config/constants.js` module centralizing all default values (GIT_DEFAULTS, NPM_DEFAULTS, CHANGELOG_DEFAULTS, HOTFIX_DEFAULTS)
- New `bin/validators.js` module with security validation functions (`validateConfigName`, `validateUtilityCommand`, `sanitizeArgs`, `validatePath`)

### Fixed
- **BREAKING FIX**: CLI now respects user's `.release-it.json` file instead of ignoring it ([bin/cli.js](bin/cli.js))
  - When `.release-it.json` exists: release-it naturally merges user config with preset (user has priority)
  - When `.release-it.json` absent: uses `--config` directly as before
  - Users can now customize presets via `.release-it.json` with `extends` field
- Security: Removed `shell: true` from all `spawn()` calls to prevent command injection ([bin/cli.js](bin/cli.js))
- Security: Added input validation and sanitization for all CLI arguments
- Security: Added whitelist validation for config names and utility commands

### Changed
- **Refactored all 7 configuration files** to use shared base-config builders, eliminating ~40% code duplication:
  - [config/default.js](config/default.js) - Now uses `createBaseGitConfig()`, `createBaseNpmConfig()`, `createBaseGitHubConfig()`
  - [config/hotfix.js](config/hotfix.js) - Refactored with override for hotfix commit message
  - [config/no-changelog.js](config/no-changelog.js) - Uses base configs with `changelog: false` override
  - [config/republish.js](config/republish.js) - Uses base configs with republish-specific overrides
  - [config/manual-changelog.js](config/manual-changelog.js) - Simplified using base configs
  - [config/retry-publish.js](config/retry-publish.js) - Refactored for consistency
  - [config/changelog-only.js](config/changelog-only.js) - No changes needed (special case)
- All hardcoded default values moved to `config/constants.js` (compliance with CLAUDE.md constraints)
- [config/helpers.js](config/helpers.js) - Now imports DEFAULT_CHANGELOG_COMMAND from constants

### Security
- Implemented OWASP input validation principles
- Protection against command injection via dangerous characters (`;`, `&`, `|`, `` ` ``, `$()`, etc.)
- Whitelisting approach for config names and command names
- Path traversal protection

### Internal
- Improved SOLID principles compliance:
  - Single Responsibility: Separated validation, configuration building, and constants
  - DRY: Reduced code duplication from ~40% to <5%
  - Dependency Inversion: User configs now have priority over preset configs
- All 213 unit tests still passing
- No breaking changes to existing APIs or environment variables

## [0.6.0] - 2025-10-05

### Fixed
- remove 'exec' from pnpm commands for consistency (workflows) ([f9c65d8](https://github.com/oorabona/release-it-preset/commit/f9c65d8))

### Changed
- update CLI commands to use 'pnpm exec release-it-preset' for consistency (workflows) ([56fbf58](https://github.com/oorabona/release-it-preset/commit/56fbf58))
- enhance README and examples with new CLI commands and usage instructions ([56fbf58](https://github.com/oorabona/release-it-preset/commit/56fbf58))
- bump @types/node from 22.18.8 to 24.6.2 (deps-dev) ([5692a52](https://github.com/oorabona/release-it-preset/commit/5692a52))
- Merge branch 'main' into dependabot/npm_and_yarn/types/node-24.6.2 ([09a3f65](https://github.com/oorabona/release-it-preset/commit/09a3f65))
- bump @types/node from 22.18.8 to 24.6.2 (deps-dev) ([492f0c8](https://github.com/oorabona/release-it-preset/commit/492f0c8))

## [0.5.2] - 2025-10-04

### Fixed
- correct syntax for version display in release info (workflows) ([ee63934](https://github.com/oorabona/release-it-preset/commit/ee63934))

## [0.5.1] - 2025-10-04

### Fixed
- update hotfix job description to clarify publishing and GitHub release steps (docs) ([c2203d2](https://github.com/oorabona/release-it-preset/commit/c2203d2))
- update release step to enable publishing and enhance output details (workflows) ([389471d](https://github.com/oorabona/release-it-preset/commit/389471d))
- enhance hotfix release step to include publishing and detailed output (workflows) ([ad0fdaf](https://github.com/oorabona/release-it-preset/commit/ad0fdaf))
- update tag description in publish workflow for clarity (workflows) ([9bdfb96](https://github.com/oorabona/release-it-preset/commit/9bdfb96))

## [0.5.0] - 2025-10-04

### Fixed
- update release validation to allow dirty working directory after changelog population and document why (workflows) ([3433ff0](https://github.com/oorabona/release-it-preset/commit/3433ff0))
- reorder changelog population step in release process (workflows) ([3ec97bf](https://github.com/oorabona/release-it-preset/commit/3ec97bf))
- update changelog and release validation steps to use release-it-preset commands (workflows) ([ed40bf6](https://github.com/oorabona/release-it-preset/commit/ed40bf6))
- add workflow_call trigger to validate PR workflow (workflows) ([7dab860](https://github.com/oorabona/release-it-preset/commit/7dab860))
- enable publish workflow to reusability, include tag input and NPM_TOKEN secret for workflow_call trigger (workflows) ([18a6b84](https://github.com/oorabona/release-it-preset/commit/18a6b84))
- update reusable verify workflow reference for clarity (workflows) ([25c89d8](https://github.com/oorabona/release-it-preset/commit/25c89d8))
- standardize npm auth and use release-it-preset commands (workflows) ([ea85a6a](https://github.com/oorabona/release-it-preset/commit/ea85a6a))
- set fetch-depth to 0 for full history and tags in checkout steps ([cd2b75f](https://github.com/oorabona/release-it-preset/commit/cd2b75f))

### Changed
- add comprehensive guide for reusable workflows in CI/CD ([a9f6af5](https://github.com/oorabona/release-it-preset/commit/a9f6af5))
- update CI/CD integration examples with modern workflows and best practices ([45a9e72](https://github.com/oorabona/release-it-preset/commit/45a9e72))
- enhance README with reusable workflows section and detailed examples ([30a4ebd](https://github.com/oorabona/release-it-preset/commit/30a4ebd))
- Set package-ecosystem to 'npm' in dependabot config ([89eeda0](https://github.com/oorabona/release-it-preset/commit/89eeda0))
- add YAML document separator to build-dist.yml ([43bc7a0](https://github.com/oorabona/release-it-preset/commit/43bc7a0))

## [0.4.0] - 2025-10-04

### Added
- add GIT_CHANGELOG_COMMAND environment variable to customize changelog command ([f3389e3](https://github.com/oorabona/release-it-preset/commit/f3389e3))

### Fixed
- add cases to ignore release commits in changelog population ([1a3bb6c](https://github.com/oorabona/release-it-preset/commit/1a3bb6c))
- standardize NPM token environment variable name across workflows and documentation ([3149c10](https://github.com/oorabona/release-it-preset/commit/3149c10))

### Changed
- enhance CLI command tests by validating init and validate commands in a temporary project (test) ([45502e1](https://github.com/oorabona/release-it-preset/commit/45502e1))

## [0.3.0] - 2025-10-04

### Changed
- CI now compiles release scripts once and shares the `dist` artifact across jobs to avoid redundant builds and keep CLI tests aligned with published output. ([ca2d289](https://github.com/oorabona/release-it-preset/commit/ca2d289))

## [0.2.0] - 2025-10-04

### Added
- Made GitHub release creation and npm publishing opt-in via `GITHUB_RELEASE` and `NPM_PUBLISH`, updated documentation, and wired the CI `publish.yml` workflow to run `release-it-preset retry-publish --ci` for GitHub + npm publishing. ([6b68923](https://github.com/oorabona/release-it-preset/commit/6b68923))

## [0.1.0] - 2025-10-04

### Added
- add manual changelog release configuration and update CLI commands ([5f9d4b7](https://github.com/oorabona/release-it-preset/commit/5f9d4b7))
- update README and configuration to support retrying releases with the same version ([cd4c0d8](https://github.com/oorabona/release-it-preset/commit/cd4c0d8))
- add unit tests for retry-publish, semver-utils, and validate-release (tests) ([6679e79](https://github.com/oorabona/release-it-preset/commit/6679e79))
    - Implemented unit tests for the retry-publish script, covering various scenarios including readiness checks, error handling, and logging.
    - Added tests for semver-utils to validate and normalize semantic versioning.
    - Created comprehensive tests for validate-release, ensuring all validation functions are covered, including changelog existence, format, and git repository checks.
    - Introduced TypeScript configuration for better type checking and module resolution.
    - Set up Vitest configuration for testing with coverage reporting.



[Unreleased]: https://github.com/oorabona/release-it-preset/compare/v0.13.1...HEAD
[v0.9.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.9.0
[0.9.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.9.0
[v0.8.1]: https://github.com/oorabona/release-it-preset/releases/tag/v0.8.1
[0.8.1]: https://github.com/oorabona/release-it-preset/releases/tag/v0.8.1
[v0.1.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.1.0
[0.1.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.1.0
[v0.2.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.2.0
[0.2.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.2.0
[v0.3.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.3.0
[0.3.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.3.0
[v0.4.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.4.0
[0.4.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.4.0
[v0.5.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.5.0
[0.5.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.5.0
[v0.5.1]: https://github.com/oorabona/release-it-preset/releases/tag/v0.5.1
[0.5.1]: https://github.com/oorabona/release-it-preset/releases/tag/v0.5.1
[v0.5.2]: https://github.com/oorabona/release-it-preset/releases/tag/v0.5.2
[0.5.2]: https://github.com/oorabona/release-it-preset/releases/tag/v0.5.2
[v0.6.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.6.0
[0.6.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.6.0
[v0.7.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.7.0
[0.7.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.7.0
[v0.8.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.8.0
[0.8.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.8.0
[v0.10.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.10.0
[0.10.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.10.0
[v0.10.1]: https://github.com/oorabona/release-it-preset/releases/tag/v0.10.1
[0.10.1]: https://github.com/oorabona/release-it-preset/releases/tag/v0.10.1
[v0.11.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.11.0
[0.11.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.11.0
[v0.12.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.12.0
[0.12.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.12.0
[v0.13.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.13.0
[0.13.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.13.0
[v0.13.1]: https://github.com/oorabona/release-it-preset/releases/tag/v0.13.1
[0.13.1]: https://github.com/oorabona/release-it-preset/releases/tag/v0.13.1