/**
 * Republish release-it configuration
 *
 * DANGER: This configuration moves an existing git tag and updates the GitHub
 * release. It breaks semantic versioning immutability for that tag.
 *
 * Scope: git tag move + GitHub release update ONLY.
 * npm immutability (since 2016) makes republishing a version to npm impossible.
 * This preset never attempts an npm publish regardless of NPM_PUBLISH.
 * See ADR 0005 (docs/adr/0005-republish-scope-narrowing.md).
 *
 * Only use when you need to:
 * - Move an existing git tag to a different commit
 * - Update the corresponding GitHub release notes
 *
 * Alternatives for other recovery scenarios:
 * - dist-tag changes: npm dist-tag add @pkg@version <tag>
 * - Failed npm/GitHub publish: use the retry-publish preset
 *
 * Publishing steps remain opt-in:
 * - Set GITHUB_RELEASE=true to update the GitHub release
 *
 * Usage:
 * ```bash
 * pnpm release-it --config node_modules/@oorabona/release-it-preset/config/republish.js
 * ```
 */

import { runScriptCommand } from './helpers.js';
import { createBaseGitConfig, createBaseGitHubConfig, createBaseNpmConfig } from './base-config.js';

const config = {
  increment: false,
  git: createBaseGitConfig({
    commitMessage: process.env.GIT_COMMIT_MESSAGE || 'chore: republish v${version}',
    tagAnnotation: 'Release ${version} (republished)',
  }),
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
  // npm immutability (since 2016) makes republishing a version impossible.
  // The preset's scope is narrowed to git tag move + GitHub release update.
  // Use `npm dist-tag add` to redirect tags, or `retry-publish` for failed publishes.
  npm: createBaseNpmConfig({ publish: false }),
  github: createBaseGitHubConfig({
    update: true,
  }),
};

export default config;
