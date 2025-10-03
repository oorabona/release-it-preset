/**
 * No-changelog release-it configuration
 *
 * This configuration disables changelog generation for quick releases:
 * - Skips changelog updates
 * - Still performs git operations
 * - Still publishes to npm
 * - Still creates GitHub releases
 *
 * Usage:
 * ```bash
 * pnpm release-it --config node_modules/@oorabona/release-it-preset/config/no-changelog.js
 * ```
 */

const config = {
  git: {
    changelog: false,
    commitMessage: process.env.GIT_COMMIT_MESSAGE || 'release: bump v${version}',
    tagName: process.env.GIT_TAG_NAME || 'v${version}',
    requireBranch: process.env.GIT_REQUIRE_BRANCH || 'main',
    requireUpstream: process.env.GIT_REQUIRE_UPSTREAM === 'true',
    requireCleanWorkingDir: process.env.GIT_REQUIRE_CLEAN === 'true',
  },
  github: {
    release: process.env.GITHUB_RELEASE !== 'false',
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
