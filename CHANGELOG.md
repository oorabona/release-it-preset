# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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



[Unreleased]: https://github.com/oorabona/release-it-preset/compare/v0.2.0...HEAD
[v0.1.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.1.0
[0.1.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.1.0
[v0.2.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.2.0
[0.2.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.2.0