/**
 * Default release-it configuration
 *
 * This configuration provides a complete release workflow with:
 * - Keep a Changelog format
 * - Git commit, tag, and push
 * - GitHub releases
 * - npm publishing with provenance
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

import { createReleaseNotesGenerator, runScriptCommand } from './helpers.js';

const config = {
  git: {
    commitMessage: process.env.GIT_COMMIT_MESSAGE || 'release: bump v${version}',
    tagName: process.env.GIT_TAG_NAME || 'v${version}',
    requireBranch: process.env.GIT_REQUIRE_BRANCH || 'main',
    requireUpstream: process.env.GIT_REQUIRE_UPSTREAM === 'true',
    requireCleanWorkingDir: process.env.GIT_REQUIRE_CLEAN === 'true',
  },
  hooks: {
    'before:bump': [
      runScriptCommand('populate-unreleased-changelog'),
    ],
    'after:bump': [
      runScriptCommand('republish-changelog'),
    ],
  },
  github: {
    release: process.env.GITHUB_RELEASE !== 'false',
    releaseNotes: createReleaseNotesGenerator(),
  },
  npm: {
    skipChecks: process.env.NPM_SKIP_CHECKS === 'true',
    publish: process.env.NPM_PUBLISH !== 'false',
    publishArgs: [
      '--provenance',
      '--access',
      process.env.NPM_ACCESS || 'public',
    ],
  },
};

export default config;
