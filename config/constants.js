/**
 * Configuration constants and defaults
 *
 * This module centralizes all default values used across the preset configurations.
 * By centralizing these values, we ensure consistency and make it easier to update
 * defaults in the future.
 *
 * IMPORTANT: These are ONLY fallback values when environment variables are not set.
 * All configuration should be driven by environment variables in production.
 */

/**
 * Git configuration defaults
 */
export const GIT_DEFAULTS = {
  COMMIT_MESSAGE: 'release: bump v${version}',
  HOTFIX_COMMIT_MESSAGE: 'hotfix: bump v${version}',
  TAG_NAME: 'v${version}',
  REQUIRE_BRANCH: 'main',
  REMOTE: 'origin',
};

/**
 * Default git changelog command
 * Filters out commits matching release/hotfix/ci patterns
 */
export const DEFAULT_CHANGELOG_COMMAND = [
  'git log',
  '--pretty=format:"* %s (%h)"',
  '${from}..${to}',
  '--grep="^release"',
  '--grep="^Release"',
  '--grep="^release-"',
  '--grep="^Release-"',
  '--grep="^hotfix"',
  '--grep="^Hotfix"',
  '--grep="^ci"',
  '--grep="^CI"',
  '--invert-grep',
].join(' ');

/**
 * npm configuration defaults
 */
export const NPM_DEFAULTS = {
  ACCESS: 'public',
  VERSION_ARGS: ['--allow-same-version'],
  PUBLISH_ARGS_BASE: ['--provenance'],
};

/**
 * Changelog configuration defaults
 */
export const CHANGELOG_DEFAULTS = {
  FILE: 'CHANGELOG.md',
  UNRELEASED_SECTION: '## [Unreleased]',
};

/**
 * Keep a Changelog section headers
 */
export const CHANGELOG_SECTIONS = {
  ADDED: '### Added',
  FIXED: '### Fixed',
  CHANGED: '### Changed',
  REMOVED: '### Removed',
  SECURITY: '### Security',
  BREAKING: '### ⚠️ BREAKING CHANGES',
};

/**
 * Hotfix configuration defaults
 */
export const HOTFIX_DEFAULTS = {
  INCREMENT: 'patch',
};
