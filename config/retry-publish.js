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

import { createReleaseNotesGenerator } from './helpers.js';

const config = {
  increment: false,
  git: false,
  npm: {
    skipChecks: process.env.NPM_SKIP_CHECKS === 'true',
    publish: process.env.NPM_PUBLISH === 'true',
    versionArgs: ['--allow-same-version'],
    publishArgs: [
      '--provenance',
      '--access',
      process.env.NPM_ACCESS || 'public',
    ],
  },
  github: {
    release: process.env.GITHUB_RELEASE === 'true',
    update: true,
    releaseNotes: createReleaseNotesGenerator(),
  },
};

export default config;
