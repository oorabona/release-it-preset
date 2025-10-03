/**
 * Retry publish release-it configuration
 *
 * This configuration retries publishing an existing version that failed:
 * - No version increment
 * - No git operations
 * - Only npm publish
 * - Updates GitHub release
 *
 * Usage:
 * First run the retry script to checkout the tag:
 * ```bash
 * node node_modules/@oorabona/release-it-preset/dist/scripts/retry-publish.js
 * pnpm release-it --config node_modules/@oorabona/release-it-preset/config/retry-publish.js
 * ```
 */

import { createReleaseNotesGenerator } from './helpers.js';

const config = {
  increment: false,
  git: false,
  npm: {
    skipChecks: process.env.NPM_SKIP_CHECKS === 'true',
    publish: process.env.NPM_PUBLISH !== 'false',
    publishArgs: [
      '--provenance',
      '--access',
      process.env.NPM_ACCESS || 'public',
    ],
  },
  github: {
    release: process.env.GITHUB_RELEASE !== 'false',
    update: true,
    releaseNotes: createReleaseNotesGenerator(),
  },
};

export default config;
