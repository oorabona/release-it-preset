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
 * Publishing steps remain opt-in:
 * - Set GITHUB_RELEASE=true to update the GitHub release
 * - Set NPM_PUBLISH=true to republish to npm with provenance
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
  npm: createBaseNpmConfig(),
  github: createBaseGitHubConfig({
    update: true,
  }),
};

export default config;
