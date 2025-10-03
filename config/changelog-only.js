/**
 * Changelog-only release-it configuration
 *
 * This configuration only generates/updates the changelog without:
 * - Version increment
 * - Git operations
 * - npm publishing
 * - GitHub releases
 *
 * Useful for preparing changelogs in CI or before actual release.
 *
 * Usage:
 * ```bash
 * pnpm release-it --config node_modules/@oorabona/release-it-preset/config/changelog-only.js --ci
 * ```
 */

import { runScriptCommand } from './helpers.js';

const config = {
  increment: false,
  git: {
    changelog: false,
    commit: false,
    tag: false,
    push: false,
  },
  hooks: {
    'before:init': [
      runScriptCommand('populate-unreleased-changelog'),
    ],
  },
  npm: {
    publish: false,
  },
  github: {
    release: false,
  },
};

export default config;
