/**
 * Hotfix release-it configuration
 *
 * This configuration is for emergency hotfix releases:
 * - Forces patch version increment
 * - Generates changelog from git log
 * - Populates unreleased section before bump
 * - Optionally creates GitHub release with extracted notes (set GITHUB_RELEASE=true)
 * - Optionally publishes to npm with provenance (set NPM_PUBLISH=true)
 *
 * Usage:
 * ```bash
 * pnpm release-it --config node_modules/@oorabona/release-it-preset/config/hotfix.js
 * ```
 */

import { createReleaseNotesGenerator, getGitChangelogCommand, runScriptCommand } from './helpers.js';

const config = {
  increment: process.env.HOTFIX_INCREMENT || 'patch',
  git: {
    changelog: getGitChangelogCommand(),
    commitMessage: process.env.GIT_COMMIT_MESSAGE || 'hotfix: bump v${version}',
    tagName: process.env.GIT_TAG_NAME || 'v${version}',
    requireBranch: process.env.GIT_REQUIRE_BRANCH || 'main',
    requireUpstream: process.env.GIT_REQUIRE_UPSTREAM === 'true',
    requireCleanWorkingDir: process.env.GIT_REQUIRE_CLEAN === 'true',
  },
  hooks: {
    'before:bump': [
      'echo "Creating hotfix release..."',
      runScriptCommand('populate-unreleased-changelog'),
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
