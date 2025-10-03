/**
 * Git utility functions shared across scripts
 */

import type { ExecSyncOptions } from 'node:child_process';

export interface GitDeps {
  execSync: (command: string, options?: ExecSyncOptions) => Buffer | string;
  getEnv: (key: string) => string | undefined;
  warn?: (message: string) => void;
}

/**
 * Get GitHub repository URL for commit/tag links
 *
 * Priority:
 * 1. GITHUB_REPOSITORY environment variable (format: owner/repo)
 * 2. Git remote URL (extracted from git config)
 *
 * @param deps Dependencies for git operations
 * @returns Repository URL or empty string if not determinable
 */
export function getGitHubRepoUrl(deps: GitDeps): string {
  const githubRepo = deps.getEnv('GITHUB_REPOSITORY');
  if (githubRepo) {
    return `https://github.com/${githubRepo}`;
  }

  try {
    const remote = deps.getEnv('GIT_REMOTE') || 'origin';
    const remoteUrl = (deps.execSync(`git config --get remote.${remote}.url`, { encoding: 'utf8' }) as string).trim();
    return remoteUrl
      .replace(/^git@github\.com:/, 'https://github.com/')
      .replace(/\.git$/, '');
  } catch (error) {
    if (deps.warn) {
      deps.warn('⚠️  Could not determine repository URL. Links will not be generated.');
      deps.warn('   Set GITHUB_REPOSITORY environment variable (e.g., owner/repo)');
    }
    return '';
  }
}
