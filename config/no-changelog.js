/**
 * No-changelog release-it configuration
 *
 * This configuration disables changelog generation for quick releases:
 * - Skips changelog updates
 * - Still performs git operations
 * - Optionally publishes to npm (set NPM_PUBLISH=true)
 * - Optionally creates GitHub releases (set GITHUB_RELEASE=true)
 *
 * Usage:
 * ```bash
 * pnpm release-it --config node_modules/@oorabona/release-it-preset/config/no-changelog.js
 * ```
 */

import { createBaseGitConfig, createBaseGitHubConfig, createBaseNpmConfig } from './base-config.js';

const config = {
  git: createBaseGitConfig({
    changelog: false,
  }),
  github: createBaseGitHubConfig({
    releaseNotes: undefined, // No release notes without changelog
  }),
  npm: createBaseNpmConfig(),
};

export default config;
