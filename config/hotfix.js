/**
 * Hotfix release-it configuration
 *
 * This configuration is for emergency hotfix releases:
 * - Forces patch version increment
 * - Generates changelog from git log
 * - Populates unreleased section before bump
 * - Optionally creates GitHub release with extracted notes (set GITHUB_RELEASE=true)
 * - Optionally publishes to npm with provenance (set NPM_PUBLISH=true)
 *
 * Usage:
 * ```bash
 * pnpm release-it --config node_modules/@oorabona/release-it-preset/config/hotfix.js
 * ```
 */

import { runScriptCommand } from './helpers.js';
import { createBaseGitConfig, createBaseGitHubConfig, createBaseNpmConfig } from './base-config.js';
import { GIT_DEFAULTS, HOTFIX_DEFAULTS } from './constants.js';

const config = {
  increment: process.env.HOTFIX_INCREMENT || HOTFIX_DEFAULTS.INCREMENT,
  git: createBaseGitConfig({
    commitMessage: process.env.GIT_COMMIT_MESSAGE || GIT_DEFAULTS.HOTFIX_COMMIT_MESSAGE,
  }),
  hooks: {
    'before:bump': [
      'echo "Creating hotfix release..."',
      runScriptCommand('populate-unreleased-changelog'),
    ],
  },
  github: createBaseGitHubConfig(),
  npm: createBaseNpmConfig(),
};

export default config;
