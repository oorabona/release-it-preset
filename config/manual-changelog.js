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

import { createReleaseNotesGenerator, getGitChangelogCommand, runScriptCommand } from './helpers.js';

const config = {
  git: {
    changelog: getGitChangelogCommand(),
    commitMessage: process.env.GIT_COMMIT_MESSAGE || 'release: bump v${version}',
    tagName: process.env.GIT_TAG_NAME || 'v${version}',
    requireBranch: process.env.GIT_REQUIRE_BRANCH || 'main',
    requireUpstream: process.env.GIT_REQUIRE_UPSTREAM === 'true',
    requireCleanWorkingDir: process.env.GIT_REQUIRE_CLEAN === 'true',
  },
  hooks: {
    // No before:bump - preserve manual changelog edits
    'after:bump': [
      runScriptCommand('republish-changelog'),
    ],
  },
  github: {
    release: process.env.GITHUB_RELEASE === 'true',
    releaseNotes: createReleaseNotesGenerator(),
  },
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
};

export default config;
