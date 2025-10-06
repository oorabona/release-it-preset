/**
 * Default release-it configuration
 *
 * This configuration provides a complete release workflow with:
 * - Keep a Changelog format
 * - Git commit, tag, and push
 * - Optional GitHub releases (set GITHUB_RELEASE=true)
 * - Optional npm publishing with provenance (set NPM_PUBLISH=true)
 *
 * Usage in client project:
 * ```json
 * {
 *   "release-it": {
 *     "extends": "@oorabona/release-it-preset/config/default"
 *   }
 * }
 * ```
 */

import { runScriptCommand } from './helpers.js';
import { createBaseGitConfig, createBaseGitHubConfig, createBaseNpmConfig } from './base-config.js';

const config = {
  git: createBaseGitConfig(),
  hooks: {
    'before:bump': [
      runScriptCommand('populate-unreleased-changelog'),
    ],
    'after:bump': [
      runScriptCommand('republish-changelog'),
    ],
  },
  github: createBaseGitHubConfig(),
  npm: createBaseNpmConfig(),
};

export default config;
