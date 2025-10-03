/**
 * Hotfix release-it configuration
 *
 * This configuration is for emergency hotfix releases:
 * - Forces patch version increment
 * - Generates changelog from git log
 * - Populates unreleased section before bump
 * - Creates GitHub release with extracted notes
 *
 * Usage:
 * ```bash
 * pnpm release-it --config node_modules/@oorabona/release-it-preset/config/hotfix.js
 * ```
 */

import { createReleaseNotesGenerator, runScriptCommand } from './helpers.js';

const config = {
  increment: process.env.HOTFIX_INCREMENT || 'patch',
  git: {
    changelog: 'git log --pretty=format:"- %s" ${latestTag}..HEAD',
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
