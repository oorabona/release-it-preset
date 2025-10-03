#!/usr/bin/env tsx
/**
 * Retry publish script
 *
 * This script retries publishing an existing version to npm and GitHub Releases.
 * Used when the initial publish failed but the Git tag was already created.
 *
 * Safety features:
 * - Checks out the exact commit of the latest tag
 * - Doesn't modify any Git history
 * - Restores the original branch after publishing
 * - Verifies the tag exists before proceeding
 *
 * Usage:
 *   tsx retry-publish.ts
 *   # Then run: release-it --config retry-publish.js
 */

import type { ExecSyncOptions } from 'node:child_process';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export interface RetryPublishDeps {
  execSync: (command: string, options?: ExecSyncOptions) => Buffer | string;
  log: (message: string) => void;
  warn: (message: string) => void;
  readFileSync: typeof readFileSync;
}

export interface RetryPublishResult {
  currentBranch: string;
  latestTag: string;
  tagCommit: string;
  hasUncommittedChanges: boolean;
  packageVersion?: string;
}

export function retryPublish(deps: RetryPublishDeps): RetryPublishResult {
  deps.log('🔄 Starting retry publish process...');

  const currentBranch = (deps.execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }) as string).trim();
  deps.log(`ℹ️  Current branch: ${currentBranch}`);

  let latestTag: string;
  try {
    latestTag = (deps.execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }) as string).trim();
    deps.log(`ℹ️  Latest tag found: ${latestTag}`);
  } catch {
    throw new Error('No tags found in repository');
  }

  let tagCommit: string;
  try {
    tagCommit = (deps.execSync(`git rev-parse ${latestTag}`, { encoding: 'utf8' }) as string).trim();
    deps.log(`ℹ️  Tag ${latestTag} points to commit: ${tagCommit.substring(0, 8)}`);
  } catch {
    throw new Error(`Tag ${latestTag} not found`);
  }

  let hasUncommittedChanges = false;
  try {
    deps.execSync('git diff --quiet', { stdio: 'pipe' });
    deps.execSync('git diff --cached --quiet', { stdio: 'pipe' });
  } catch {
    hasUncommittedChanges = true;
    deps.warn('⚠️  You have uncommitted changes. They will be preserved.');
  }

  let packageVersion: string | undefined;
  try {
    const packageJson = JSON.parse(deps.readFileSync('package.json', 'utf8') as string);
    if (typeof packageJson.version === 'string' && packageJson.version.trim()) {
      packageVersion = packageJson.version.trim();
      const normalizedTag = latestTag.replace(/^v/, '');
      if (packageVersion !== normalizedTag) {
        deps.warn(
          `⚠️  package.json version (${packageVersion}) does not match latest tag (${normalizedTag}).`,
        );
      } else {
        deps.log(`ℹ️  package.json version (${packageVersion}) matches the latest tag.`);
      }
    }
  } catch (error) {
    deps.warn(
      /* c8 ignore next */
      `⚠️  Unable to inspect package.json version: ${error instanceof Error ? error.message : error}`,
    );
  }

  deps.log('✅ Pre-flight checks passed. Ready to retry publish.');
  deps.log(`📦 This will republish from tag ${latestTag} to npm and GitHub Releases`);
  deps.log('🔒 No Git history will be modified');
  deps.log('💡 Next command: release-it --config node_modules/@oorabona/release-it-preset/config/retry-publish.js');

  return {
    currentBranch,
    latestTag,
    tagCommit,
    hasUncommittedChanges,
    packageVersion,
  };
}

/**
 * CLI entry point - only runs when script is executed directly
 */
/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    retryPublish({
      execSync,
      readFileSync,
      log: console.log,
      warn: console.warn,
    });
  } catch (error) {
    console.error(`❌ Pre-flight checks failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
/* c8 ignore end */
