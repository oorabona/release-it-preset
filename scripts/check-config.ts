#!/usr/bin/env tsx
/**
 * Check and display release configuration and project status
 *
 * This script displays:
 * - Environment variables and their values
 * - Repository information
 * - Git tags and latest version
 * - Commits since last tag
 * - Configuration files status
 *
 * Usage:
 *   tsx check-config.ts
 */

import type { ExecSyncOptions } from 'node:child_process';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { getGitHubRepoUrl } from './lib/git-utils.js';

export interface CheckConfigDeps {
  execSync: (command: string, options?: ExecSyncOptions) => Buffer | string;
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  getEnv: (key: string) => string | undefined;
  log: (message: string) => void;
}

export function safeExec(command: string, deps: CheckConfigDeps): string | null {
  try {
    return (deps.execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) as string).trim();
  } catch {
    return null;
  }
}


export function getEnvVar(name: string, deps: CheckConfigDeps, defaultValue?: string): string {
  const value = deps.getEnv(name);
  if (value) {
    return `${value} (from env)`;
  }
  if (defaultValue) {
    return `${defaultValue} (default)`;
  }
  return '(not set)';
}

export interface CheckConfigResult {
  envVars: Record<string, string>;
  repoUrl: string | null;
  currentBranch: string | null;
  latestTag: string | null;
  commitCount: number;
  filesStatus: Record<string, boolean>;
  npmUsername: string | null;
}

/**
 * Get current git branch
 */
export function getCurrentBranch(deps: CheckConfigDeps): string | null {
  return safeExec('git rev-parse --abbrev-ref HEAD', deps);
}

/**
 * Get latest git tag
 */
export function getLatestTag(deps: CheckConfigDeps): string | null {
  return safeExec('git describe --tags --abbrev=0', deps);
}

/**
 * Get commit count since tag (or all commits if no tag)
 */
export function getCommitCount(deps: CheckConfigDeps, latestTag: string | null): number {
  const commits = latestTag
    ? safeExec(`git log --pretty=format:"%h" ${latestTag}..HEAD`, deps)
    : safeExec('git log --pretty=format:"%h"', deps);
  return commits ? commits.split('\n').length : 0;
}

/**
 * Get files status (existence check)
 */
export function getFilesStatus(deps: CheckConfigDeps): Record<string, boolean> {
  return {
    'CHANGELOG.md': deps.existsSync('CHANGELOG.md'),
    '.release-it.json': deps.existsSync('.release-it.json'),
    'package.json': deps.existsSync('package.json'),
    '.git': deps.existsSync('.git'),
  };
}

/**
 * Get npm username (if logged in)
 */
export function getNpmUsername(deps: CheckConfigDeps): string | null {
  return safeExec('npm whoami', deps);
}

/**
 * Get all environment variables with defaults
 */
export function getEnvironmentVariables(deps: CheckConfigDeps): Record<string, string> {
  const vars: Array<[string, string?]> = [
    ['CHANGELOG_FILE', 'CHANGELOG.md'],
    ['GIT_COMMIT_MESSAGE', 'release: bump v${version}'],
    ['GIT_TAG_NAME', 'v${version}'],
    ['GIT_REQUIRE_BRANCH', 'main'],
    ['GIT_REQUIRE_UPSTREAM', 'false'],
    ['GIT_REQUIRE_CLEAN', 'false'],
    ['GIT_REMOTE', 'origin'],
  ['GITHUB_RELEASE', 'false'],
    ['GITHUB_REPOSITORY'],
  ['NPM_PUBLISH', 'false'],
    ['NPM_SKIP_CHECKS', 'false'],
    ['NPM_ACCESS', 'public'],
  ];

  const envVars: Record<string, string> = {};
  for (const [name, defaultValue] of vars) {
    envVars[name] = getEnvVar(name, deps, defaultValue);
  }
  return envVars;
}

export function checkConfig(deps: CheckConfigDeps): CheckConfigResult {
  const envVars = getEnvironmentVariables(deps);
  const repoUrl = getGitHubRepoUrl({
    execSync: deps.execSync,
    getEnv: deps.getEnv,
  }) || null;
  const currentBranch = getCurrentBranch(deps);
  const latestTag = getLatestTag(deps);
  const commitCount = getCommitCount(deps, latestTag);
  const filesStatus = getFilesStatus(deps);
  const npmUsername = getNpmUsername(deps);

  return {
    envVars,
    repoUrl,
    currentBranch,
    latestTag,
    commitCount,
    filesStatus,
    npmUsername,
  };
}

function section(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}\n`);
}

export function displayEnvironmentVariables(envVars: Record<string, string>) {
  section('Environment Variables');
  for (const [name, value] of Object.entries(envVars)) {
    console.log(`  ${name.padEnd(25)} ${value}`);
  }
}

export function displayRepositoryInfo(deps: CheckConfigDeps, repoUrl: string | null, currentBranch: string | null) {
  section('Repository Information');

  if (repoUrl) {
    console.log(`  Repository URL: ${repoUrl}`);
  } else {
    console.log(`  Repository URL: ❌ Could not determine`);
  }

  if (currentBranch) {
    console.log(`  Current branch: ${currentBranch}`);
  }

  const remote = deps.getEnv('GIT_REMOTE') || 'origin';
  const remoteUrl = safeExec(`git config --get remote.${remote}.url`, deps);
  if (remoteUrl) {
    console.log(`  Remote (${remote}): ${remoteUrl}`);
  }

  const upstream = safeExec(`git rev-parse --abbrev-ref --symbolic-full-name @{u}`, deps);
  if (upstream) {
    console.log(`  Upstream: ${upstream}`);
  } else {
    console.log(`  Upstream: ❌ No upstream configured`);
  }

  const status = safeExec('git status --porcelain', deps);
  if (status === '') {
    console.log(`  Working directory: ✅ Clean`);
  } else if (status) {
    const fileCount = status.split('\n').length;
    console.log(`  Working directory: ⚠️  ${fileCount} uncommitted change(s)`);
  }
}

export function displayVersionAndTags(deps: CheckConfigDeps, latestTag: string | null) {
  section('Version & Tags');

  const packageJsonPath = 'package.json';
  if (deps.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(deps.readFileSync(packageJsonPath, 'utf8') as string);
      console.log(`  Current version (package.json): ${packageJson.version || '❌ Not set'}`);
    } catch {
      console.log(`  Current version: ❌ Failed to read package.json`);
    }
  } else {
    console.log(`  Current version: ❌ package.json not found`);
  }

  if (latestTag) {
    console.log(`  Latest git tag: ${latestTag}`);
  } else {
    console.log(`  Latest git tag: ❌ No tags found`);
  }

  const allTags = safeExec('git tag --sort=-v:refname', deps);
  if (allTags) {
    const tags = allTags.split('\n').slice(0, 5);
    console.log(`  Recent tags (last 5):`);
    for (const tag of tags) {
      console.log(`    - ${tag}`);
    }
    const totalTags = allTags.split('\n').length;
    if (totalTags > 5) {
      console.log(`    ... and ${totalTags - 5} more`);
    }
  }
}

export function displayCommitsSinceLastTag(deps: CheckConfigDeps, latestTag: string | null) {
  section('Commits Since Last Tag');

  let commitRange: string;
  if (latestTag) {
    commitRange = `${latestTag}..HEAD`;
    console.log(`  Range: ${commitRange}\n`);
  } else {
    commitRange = 'HEAD';
    console.log(`  No tags found, showing all commits\n`);
  }

  const commits = safeExec(`git log --pretty=format:"%h %s" ${commitRange}`, deps);

  if (!commits) {
    console.log(`  ✨ No commits since ${latestTag || 'repository creation'}`);
    return;
  }

  const commitList = commits.split('\n');
  console.log(`  Total commits: ${commitList.length}\n`);

  const displayCount = Math.min(10, commitList.length);
  console.log(`  Last ${displayCount} commit(s):`);
  for (const commit of commitList.slice(0, displayCount)) {
    console.log(`    ${commit}`);
  }

  if (commitList.length > displayCount) {
    console.log(`    ... and ${commitList.length - displayCount} more`);
  }
}

export function displayConfigurationFiles(deps: CheckConfigDeps, filesStatus: Record<string, boolean>) {
  section('Configuration Files');

  const files = [
    { path: 'CHANGELOG.md', desc: 'Changelog' },
    { path: '.release-it.json', desc: 'Release-it config' },
    { path: 'package.json', desc: 'Package manifest' },
    { path: '.git', desc: 'Git repository' },
  ];

  for (const { path, desc } of files) {
    const exists = filesStatus[path];
    const icon = exists ? '✅' : '❌';
    console.log(`  ${icon} ${desc.padEnd(20)} ${path}`);
  }

  const changelogPath = deps.getEnv('CHANGELOG_FILE') || 'CHANGELOG.md';
  if (changelogPath !== 'CHANGELOG.md' && deps.existsSync(changelogPath)) {
    console.log(`  ✅ ${'Custom changelog'.padEnd(20)} ${changelogPath} (from env)`);
  }
}

export function displayNpmStatus(deps: CheckConfigDeps, npmUsername: string | null) {
  section('npm Status');

  if (npmUsername) {
    console.log(`  ✅ Logged in as: ${npmUsername}`);
  } else {
    console.log(`  ❌ Not logged in (run: npm login)`);
  }

  const registry = safeExec('npm config get registry', deps);
  if (registry) {
    console.log(`  Registry: ${registry}`);
  }
}

/**
 * CLI entry point - only runs when script is executed directly
 */
/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    console.log('🔍 Checking release configuration and project status...');

    const deps: CheckConfigDeps = {
      execSync,
      existsSync,
      readFileSync,
      getEnv: (key: string) => process.env[key],
      log: console.log,
    };

    const result = checkConfig(deps);

    displayEnvironmentVariables(result.envVars);
    displayRepositoryInfo(deps, result.repoUrl, result.currentBranch);
    displayVersionAndTags(deps, result.latestTag);
    displayCommitsSinceLastTag(deps, result.latestTag);
    displayConfigurationFiles(deps, result.filesStatus);
    displayNpmStatus(deps, result.npmUsername);

    console.log('\n' + '='.repeat(60));
    console.log('\n✨ Check complete!');
    console.log('\nTo validate release readiness, run:');
    console.log('  pnpm release-it-preset validate\n');
  }

  main().catch((error) => {
    console.error('❌ Check failed:', error);
    process.exit(1);
  });
}
/* c8 ignore end */
