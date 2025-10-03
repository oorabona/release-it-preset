/**
 * Republish release-it configuration
 *
 * DANGER: This configuration republishes the current version without incrementing.
 * It moves the existing git tag, which breaks semantic versioning immutability.
 *
 * Only use this in exceptional cases when you need to:
 * - Fix a broken release
 * - Republish with corrected artifacts
 *
 * Usage:
 * ```bash
 * pnpm release-it --config node_modules/@oorabona/release-it-preset/config/republish.js
 * ```
 */

import { createReleaseNotesGenerator, runScriptCommand } from './helpers.js';

const config = {
  increment: false,
  git: {
    commitMessage: process.env.GIT_COMMIT_MESSAGE || 'chore: republish v${version}',
    tagName: process.env.GIT_TAG_NAME || 'v${version}',
    tagAnnotation: 'Release ${version} (republished)',
    requireBranch: process.env.GIT_REQUIRE_BRANCH || 'main',
    requireUpstream: process.env.GIT_REQUIRE_UPSTREAM === 'true',
    requireCleanWorkingDir: process.env.GIT_REQUIRE_CLEAN === 'true',
  },
  hooks: {
    'before:init': [
      'echo "⚠️  WARNING: You are about to MOVE an existing tag!"',
      'echo "⚠️  This breaks semantic versioning immutability!"',
      'echo "⚠️  Only proceed if you understand the consequences."',
    ],
    'before:bump': [
      runScriptCommand('republish-changelog'),
    ],
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
  github: {
    release: process.env.GITHUB_RELEASE !== 'false',
    update: true,
    releaseNotes: createReleaseNotesGenerator(),
  },
};

export default config;
