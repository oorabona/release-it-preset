/**
 * Manual changelog release-it configuration
 *
 * This configuration is for releases where you have manually edited
 * the [Unreleased] section in CHANGELOG.md:
 * - Skips automatic changelog population (no before:bump hook)
 * - Moves your manual [Unreleased] content to the version section (after:bump)
 * - Creates git commit, tag, and push
 * - Optionally creates GitHub release with your manual changelog (set GITHUB_RELEASE=true)
 * - Optionally publishes to npm with provenance (set NPM_PUBLISH=true)
 *
 * Typical workflow:
 * 1. Run `pnpm release-it-preset update` to generate initial changelog
 * 2. Manually edit CHANGELOG.md [Unreleased] section
 * 3. Run `pnpm release-it-preset manual-changelog` to release
 *
 * Usage:
 * ```bash
 * pnpm release-it-preset manual-changelog
 * ```
 *
 * Or via extends in client project:
 * ```json
 * {
 *   "release-it": {
 *     "extends": "@oorabona/release-it-preset/config/manual-changelog"
 *   }
 * }
 * ```
 */

import { runScriptCommand } from './helpers.js';
import { createBaseGitConfig, createBaseGitHubConfig, createBaseNpmConfig } from './base-config.js';

const config = {
  git: createBaseGitConfig(),
  hooks: {
    // No before:bump - preserve manual changelog edits
    'after:bump': [
      runScriptCommand('republish-changelog'),
    ],
  },
  github: createBaseGitHubConfig(),
  npm: createBaseNpmConfig(),
};

export default config;
