#!/usr/bin/env tsx
/**
 * Populate [Unreleased] section with commits since the last tag
 *
 * This script:
 * - Extracts commits since the last git tag
 * - Parses conventional commit messages
 * - Groups commits by type (Added, Fixed, Changed, etc.)
 * - Updates the [Unreleased] section in CHANGELOG.md
 * - Generates commit links using the repository URL
 *
 * Usage:
 *   tsx populate-unreleased-changelog.ts
 *
 * Environment variables:
 *   CHANGELOG_FILE - Path to changelog file (default: CHANGELOG.md)
 *   GITHUB_REPOSITORY - GitHub repo (owner/repo) for commit links
 *   GIT_REMOTE - Git remote name (default: origin)
 */

import type { ExecSyncOptions } from 'node:child_process';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { getGitHubRepoUrl } from './lib/git-utils.js';
import { CONVENTIONAL_COMMIT_REGEX } from './lib/commit-parser.js';

/**
 * Dependencies interface for dependency injection
 */
export interface PopulateChangelogDeps {
  execSync: (command: string, options?: ExecSyncOptions) => Buffer | string;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  getEnv: (key: string) => string | undefined;
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface CommitPart {
  type: string;
  scope?: string;
  description: string;
  sha: string;
  breaking?: boolean;
}

/**
 * Extract all conventional commit patterns from a commit body
 */
export function extractConventionalCommitParts(commitBody: string, sha: string): CommitPart[] {
  const parts: CommitPart[] = [];
  const conventionalCommitRegex = new RegExp(CONVENTIONAL_COMMIT_REGEX.source, 'gm');

  let match;
  while ((match = conventionalCommitRegex.exec(commitBody)) !== null) {
    const [, type, scope, breaking, description] = match;
    if (type && description && description.trim()) {
      const cleanDescription = description.trim().replace(/\s+/g, ' ');
      parts.push({
        type: type.trim(),
        scope: scope?.trim(),
        description: cleanDescription,
        sha,
        breaking: Boolean(breaking),
      });
    }
  }

  return parts;
}

/**
 * Normalize commit types to standard changelog categories
 */
export function normalizeCommitType(type: string): string | false {
  const typeMap: Record<string, string | false> = {
    feat: '### Added',
    feature: '### Added',
    add: '### Added',
    fix: '### Fixed',
    bugfix: '### Fixed',
    security: '### Security',
    perf: '### Changed',
    refactor: '### Changed',
    style: '### Changed',
    docs: '### Changed',
    test: '### Changed',
    chore: '### Changed',
    build: '### Changed',
    deps: '### Changed',
    dependency: '### Changed',
    dependencies: '### Changed',
    revert: '### Changed',
    remove: '### Removed',
    removed: '### Removed',
    delete: '### Removed',
    deleted: '### Removed',
    ci: false,
    release: false,
    hotfix: false,
    misc: '### Changed',
  };

  const result = typeMap[type.toLowerCase()];
  return result !== undefined ? result : '### Changed';
}


/**
 * Parse git log output and extract all conventional commit parts
 */
export function parseCommitsWithMultiplePrefixes(gitOutput: string, repoUrl: string): string {
  if (!gitOutput) return '';

  const commitEntries = gitOutput.split('|||END|||').filter((entry) => entry.trim());
  const allParts: CommitPart[] = [];

  for (const entry of commitEntries) {
    const [sha, ...bodyParts] = entry.split('|');
    const body = bodyParts.join('|').trim();

    if (/\[skip-changelog\]/i.test(body)) {
      continue;
    }

    if (sha && body) {
      const shortSha = sha.trim().substring(0, 7);
      const parts = extractConventionalCommitParts(body, shortSha);

      if (parts.length === 0) {
        const firstLine = body.split('\n')[0].trim();
        if (firstLine) {
          allParts.push({
            type: 'misc',
            description: firstLine,
            sha: shortSha,
          });
        }
      } else {
        allParts.push(...parts);
      }
    }
  }

  const groupedParts: Record<string, CommitPart[]> = {};
  const breakingChanges: CommitPart[] = [];

  for (const part of allParts) {
    // Collect breaking changes separately
    if (part.breaking) {
      breakingChanges.push(part);
    }

    const sectionName = normalizeCommitType(part.type);
    if (sectionName === false) {
      continue;
    }
    if (!groupedParts[sectionName]) {
      groupedParts[sectionName] = [];
    }
    groupedParts[sectionName].push(part);
  }

  const sections: string[] = [];
  const sectionOrder = ['### Added', '### Fixed', '### Changed', '### Removed', '### Security'];

  // Add BREAKING CHANGES section first if there are any
  if (breakingChanges.length > 0) {
    sections.push('### ⚠️ BREAKING CHANGES');
    sections.push(
      ...breakingChanges.map((part) => {
        const scopePart = part.scope ? ` (${part.scope})` : '';
        const linkPart = repoUrl ? ` ([${part.sha}](${repoUrl}/commit/${part.sha}))` : ` (${part.sha})`;
        return `- ${part.description}${scopePart}${linkPart}`;
      })
    );
    sections.push('');
  }

  for (const sectionTitle of sectionOrder) {
    if (groupedParts[sectionTitle] && groupedParts[sectionTitle].length > 0) {
      sections.push(sectionTitle);
      sections.push(
        ...groupedParts[sectionTitle].map((part) => {
          const scopePart = part.scope ? ` (${part.scope})` : '';
          const breakingIndicator = part.breaking ? ' ⚠️ BREAKING' : '';
          const linkPart = repoUrl ? ` ([${part.sha}](${repoUrl}/commit/${part.sha}))` : ` (${part.sha})`;
          return `- ${part.description}${scopePart}${breakingIndicator}${linkPart}`;
        })
      );
      sections.push('');
    }
  }

  return sections.length > 0 ? sections.join('\n').trim() : 'No changes yet.';
}

/**
 * Main function to populate changelog with dependency injection
 */
export function populateChangelog(deps: PopulateChangelogDeps): void {
  const changelogPath = deps.getEnv('CHANGELOG_FILE') || 'CHANGELOG.md';

  deps.log('📝 Populating [Unreleased] section...');

  let latestTag: string;
  try {
    latestTag = (deps.execSync('git describe --tags --abbrev=0 2>/dev/null', { encoding: 'utf8' }) as string).trim();
    deps.log(`ℹ️  Latest tag: ${latestTag}`);
  } catch {
    deps.log('ℹ️  No tags found, using all commits');
    latestTag = '';
  }

  const gitLogCommand = latestTag
    ? `git log --pretty=format:"%H|%B|||END|||" ${latestTag}..HEAD`
    : `git log --pretty=format:"%H|%B|||END|||"`;

  let gitOutput: string;
  try {
    gitOutput = (deps.execSync(gitLogCommand, { encoding: 'utf8' }) as string).trim();
  } catch {
    deps.log('ℹ️  No new commits found');
    gitOutput = '';
  }

  const repoUrl = getGitHubRepoUrl({
    execSync: deps.execSync,
    getEnv: deps.getEnv,
    warn: deps.warn,
  });
  const commits = parseCommitsWithMultiplePrefixes(gitOutput, repoUrl);
  const changelog = deps.readFileSync(changelogPath, 'utf8') as string;
  const unreleasedContent = commits && commits.trim() ? commits : 'No changes yet.';
  const unreleasedRegex = /## \[Unreleased\][\s\S]*?(?=## \[|$)/;
  const newUnreleasedSection = `## [Unreleased]\n\n${unreleasedContent}\n\n`;

  let updatedChangelog: string;
  if (changelog.match(unreleasedRegex)) {
    updatedChangelog = changelog.replace(unreleasedRegex, newUnreleasedSection);
  } else {
    const doubleNewlineIndex = changelog.indexOf('\n\n');
    if (doubleNewlineIndex === -1) {
      const trimmed = changelog.trimEnd();
      const separator = trimmed.length === 0 ? '' : '\n\n';
      updatedChangelog = `${trimmed}${separator}${newUnreleasedSection}`;
    } else {
      const insertionPoint = doubleNewlineIndex + 2;
      updatedChangelog = changelog.slice(0, insertionPoint) + newUnreleasedSection + changelog.slice(insertionPoint);
    }
  }

  deps.writeFileSync(changelogPath, updatedChangelog);

  const commitCount =
    unreleasedContent === 'No changes yet.'
      ? 0
      : unreleasedContent
          .split('\n')
          .filter((line) => line.trim().startsWith('- '))
          .length;
  deps.log(`✅ Updated [Unreleased] section with ${commitCount} commit(s)`);
}

/**
 * CLI entry point - only runs when script is executed directly
 */
/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    populateChangelog({
      execSync,
      readFileSync,
      writeFileSync,
      getEnv: (key: string) => process.env[key],
      log: console.log,
      warn: console.warn,
      error: console.error,
    });
  } catch (error) {
    console.error('❌ Failed to populate [Unreleased] section:', error);
    process.exit(1);
  }
}
/* c8 ignore end */
