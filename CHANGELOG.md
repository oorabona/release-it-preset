# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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



[Unreleased]: https://github.com/oorabona/release-it-preset/compare/v0.8.0...HEAD
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