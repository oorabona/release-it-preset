/**
 * Base configuration builders for release-it presets
 *
 * This module provides reusable configuration builders to eliminate code duplication
 * across all preset configuration files. Each builder function creates a configuration
 * object with environment variable support and sensible defaults.
 *
 * All builders support overrides to allow preset-specific customization while
 * maintaining DRY principles.
 */

import { createReleaseNotesGenerator, getGitChangelogCommand } from './helpers.js';
import { GIT_DEFAULTS, NPM_DEFAULTS } from './constants.js';

/**
 * Creates base git configuration
 *
 * @param {Object} overrides - Properties to override in the base config
 * @returns {Object} Git configuration object
 */
export function createBaseGitConfig(overrides = {}) {
  const defaults = {
    changelog: getGitChangelogCommand(),
    commitMessage: process.env.GIT_COMMIT_MESSAGE || GIT_DEFAULTS.COMMIT_MESSAGE,
    tagName: process.env.GIT_TAG_NAME || GIT_DEFAULTS.TAG_NAME,
    requireBranch: process.env.GIT_REQUIRE_BRANCH || GIT_DEFAULTS.REQUIRE_BRANCH,
    requireUpstream: process.env.GIT_REQUIRE_UPSTREAM === 'true',
    requireCleanWorkingDir: process.env.GIT_REQUIRE_CLEAN === 'true',
  };

  return {
    ...defaults,
    ...overrides,
  };
}

/**
 * Creates base npm configuration
 *
 * @param {Object} overrides - Properties to override in the base config
 * @returns {Object} Npm configuration object
 */
export function createBaseNpmConfig(overrides = {}) {
  const defaults = {
    skipChecks: process.env.NPM_SKIP_CHECKS === 'true',
    publish: process.env.NPM_PUBLISH === 'true',
    versionArgs: NPM_DEFAULTS.VERSION_ARGS,
    publishArgs: [
      ...NPM_DEFAULTS.PUBLISH_ARGS_BASE,
      '--access',
      process.env.NPM_ACCESS || NPM_DEFAULTS.ACCESS,
    ],
  };

  return {
    ...defaults,
    ...overrides,
  };
}

/**
 * Creates base GitHub configuration
 *
 * @param {Object} overrides - Properties to override in the base config
 * @returns {Object} GitHub configuration object
 */
export function createBaseGitHubConfig(overrides = {}) {
  const defaults = {
    release: process.env.GITHUB_RELEASE === 'true',
    releaseNotes: createReleaseNotesGenerator(),
  };

  return {
    ...defaults,
    ...overrides,
  };
}
