/**
 * Retry publish release-it configuration
 *
 * This configuration retries publishing an existing version that failed:
 * - No version increment
 * - No git operations
 * - Optionally runs npm publish with provenance (set NPM_PUBLISH=true)
 * - Optionally updates GitHub release (set GITHUB_RELEASE=true)
 *
 * Usage:
 * First run the retry script to checkout the tag:
 * ```bash
 * pnpm release-it-preset retry-publish-preflight
 * pnpm release-it --config node_modules/@oorabona/release-it-preset/config/retry-publish.js
 * ```
 */

import { createBaseGitHubConfig, createBaseNpmConfig } from './base-config.js';

const config = {
  increment: false,
  git: false,
  npm: createBaseNpmConfig(),
  github: createBaseGitHubConfig({
    update: true,
  }),
};

export default config;
