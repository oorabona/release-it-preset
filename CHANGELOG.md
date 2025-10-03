# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-10-03

### Added
- update README and configuration to support retrying releases with the same version ([fe6df16](https://github.com/oorabona/release-it-preset/commit/fe6df16))
- add unit tests for retry-publish, semver-utils, and validate-release (tests) ([6679e79](https://github.com/oorabona/release-it-preset/commit/6679e79))
    - Implemented unit tests for the retry-publish script, covering various scenarios including readiness checks, error handling, and logging.
    - Added tests for semver-utils to validate and normalize semantic versioning.
    - Created comprehensive tests for validate-release, ensuring all validation functions are covered, including changelog existence, format, and git repository checks.
    - Introduced TypeScript configuration for better type checking and module resolution.
    - Set up Vitest configuration for testing with coverage reporting.

### Changed
- Initial commit ([356db20](https://github.com/oorabona/release-it-preset/commit/356db20))

[Unreleased]: https://github.com/oorabona/release-it-preset/compare/v0.1.0...HEAD
[v0.1.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.1.0
[0.1.0]: https://github.com/oorabona/release-it-preset/releases/tag/v0.1.0