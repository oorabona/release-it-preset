#!/usr/bin/env tsx
/**
 * Republish changelog script
 *
 * This script handles republishing an existing version without bumping.
 * Used when a git tag exists but the package was never published to npm.
 *
 * Unlike normal changelog update, this script:
 * - Uses the existing tag version from package.json
 * - Moves [Unreleased] content to the correct version entry
 * - Handles the case where the version entry might already exist
 *
 * Usage:
 *   tsx republish-changelog.ts
 *
 * Environment variables:
 *   CHANGELOG_FILE - Path to changelog file (default: CHANGELOG.md)
 *   GITHUB_REPOSITORY - GitHub repo (owner/repo) for commit links
 *   GIT_REMOTE - Git remote name (default: origin)
 */

import type { ExecSyncOptions } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { getGitHubRepoUrl } from './lib/git-utils.js';
import { escapeRegExp } from './lib/string-utils.js';
import { validateAndNormalizeSemver } from './lib/semver-utils.js';

export interface RepublishChangelogDeps {
  execSync: (command: string, options?: ExecSyncOptions) => Buffer | string;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  getEnv: (key: string) => string | undefined;
  getCwd: () => string;
  getDate: () => string;
  log: (message: string) => void;
  warn: (message: string) => void;
}

export interface UpdateReferenceLinksResult {
  changelog: string;
  addedUnreleasedLink: boolean;
  addedVersionLinks: string[];
}

export function updateReferenceLinks(
  changelog: string,
  versionLabels: string[],
  linkTarget: string,
  unreleasedLine: string,
): UpdateReferenceLinksResult {
  const lines = changelog.split(/\r?\n/);
  const updatedLines: string[] = [];
  let foundUnreleasedLink = false;
  const foundLabels = new Set<string>();
  const uniqueLabels = [...new Set(versionLabels)];
  const labelRegexes = uniqueLabels.map((label) => ({
    label,
    regex: new RegExp(`^\\[${escapeRegExp(label)}]:`, 'i'),
  }));

  for (const ln of lines) {
    if (/^\[Unreleased\]:/i.test(ln)) {
      updatedLines.push(unreleasedLine);
      foundUnreleasedLink = true;
      continue;
    }

    const matching = labelRegexes.find(({ regex }) => regex.test(ln));
    if (matching) {
      updatedLines.push(`[${matching.label}]: ${linkTarget}`);
      foundLabels.add(matching.label);
      continue;
    }

    updatedLines.push(ln);
  }

  if (!foundUnreleasedLink) {
    updatedLines.push(unreleasedLine);
  }

  const addedVersionLinks: string[] = [];
  for (const label of uniqueLabels) {
    if (!foundLabels.has(label)) {
      updatedLines.push(`[${label}]: ${linkTarget}`);
      addedVersionLinks.push(label);
    }
  }

  return {
    changelog: updatedLines.join('\n'),
    addedUnreleasedLink: !foundUnreleasedLink,
    addedVersionLinks,
  };
}

function findExistingVersionHeading(changelog: string, normalizedVersion: string): string | null {
  const escapedVersion = escapeRegExp(normalizedVersion);
  const existingHeading = new RegExp(`^##\\s*\\[(v?${escapedVersion})\\]`, 'im').exec(changelog);
  return existingHeading?.[1] ?? null;
}

function getFirstVersionHeading(changelog: string): string | null {
  const headingRegex = /^##\s*\[(.*?)\]/gim;

  for (const match of changelog.matchAll(headingRegex)) {
    const label = match[1]?.trim();
    if (label && !/^unreleased$/i.test(label)) {
      return label;
    }
  }

  return null;
}

function inferVersionHeadingLabel(versionInput: string, normalizedVersion: string, changelog: string): string {
  const firstHeading = getFirstVersionHeading(changelog);
  if (firstHeading) {
    return /^v/i.test(firstHeading) ? `v${normalizedVersion}` : normalizedVersion;
  }

  return versionInput.trim().toLowerCase().startsWith('v') ? `v${normalizedVersion}` : normalizedVersion;
}


export function republishChangelog(version: string, deps: RepublishChangelogDeps): void {
  const changelogPath = join(deps.getCwd(), deps.getEnv('CHANGELOG_FILE') || 'CHANGELOG.md');

  deps.log(`ℹ️  Republishing version: ${version}`);

  // Validate semver format
  const normalizedVersion = validateAndNormalizeSemver(version);
  const date = deps.getDate();
  const tag = version.startsWith('v') ? version : `v${normalizedVersion}`;
  const versionLabels = [`v${normalizedVersion}`, normalizedVersion];
  const repoUrl = getGitHubRepoUrl({
    execSync: deps.execSync,
    getEnv: deps.getEnv,
    warn: deps.warn,
  });

  let changelog = deps.readFileSync(changelogPath, 'utf8') as string;

  const unreleasedBlock =
    /^(?<prefix>[^\n]*?##\s*\[?Unreleased\]?[^\n]*\n)(?<content>[\s\S]*?)(?=^##\s|^\s*---\s*$|$(?![\s\S]))/im;
  const match = changelog.match(unreleasedBlock);

  if (!match || !match.groups) {
    throw new Error('No [Unreleased] section found in CHANGELOG.md');
  }

  const unreleasedContent = match.groups.content.trim();
  const escapedVersion = escapeRegExp(normalizedVersion);
  const existingHeadingLabel = findExistingVersionHeading(changelog, normalizedVersion);
  const versionExists = Boolean(existingHeadingLabel);
  const versionHeadingLabel = existingHeadingLabel ?? inferVersionHeadingLabel(version, normalizedVersion, changelog);

  if (versionExists && !unreleasedContent) {
    deps.log(`ℹ️  Version ${tag} already exists in changelog and [Unreleased] is empty. Nothing to do.`);
    return;
  }

  if (versionExists && unreleasedContent) {
    deps.warn(`⚠️  Version ${tag} already exists in changelog but [Unreleased] has content.`);
    deps.log(`ℹ️  Updating existing ${tag} entry with unreleased content...`);

    const versionEntryRegex = new RegExp(
      `(^##\\s*\\[?(?:v?${escapedVersion})\\]?[^\\n]*\\n)((?:[\\s\\S]*?)(?=^##\\s|^\\s*---\\s*$|$(?![\\s\\S])))`,
      'im'
    );

    const versionMatch = changelog.match(versionEntryRegex);
    if (versionMatch) {
      const newVersionContent = `${versionMatch[1]}\n${unreleasedContent}\n\n`;
      changelog = changelog.replace(versionEntryRegex, newVersionContent);
      changelog = changelog.replace(unreleasedBlock, `${match.groups.prefix}\n`);
    }
  } else {
    if (!unreleasedContent) {
      throw new Error('[Unreleased] section is empty. Use populate-unreleased-changelog.ts first or add content manually.');
    }

    deps.log(`📝 Moving [Unreleased] content to ${tag} entry`);

    const newEntryLines: string[] = [];
    newEntryLines.push(`## [${versionHeadingLabel}] - ${date}`);
    newEntryLines.push('');
    newEntryLines.push(unreleasedContent);
    newEntryLines.push('');

    changelog = changelog.replace(
      unreleasedBlock,
      `${match.groups.prefix}\n${newEntryLines.join('\n')}\n`
    );
  }

  let linkTarget: string;
  let unreleasedLine: string;

  if (repoUrl.includes('github.com')) {
    linkTarget = `${repoUrl}/releases/tag/${tag}`;
    unreleasedLine = `[Unreleased]: ${repoUrl}/compare/${tag}...HEAD`;
  } else if (repoUrl.includes('gitlab')) {
    linkTarget = `${repoUrl}/-/tags/${tag}`;
    unreleasedLine = `[Unreleased]: ${repoUrl}/-/compare/${tag}...HEAD`;
  } else {
    linkTarget = repoUrl;
    unreleasedLine = `[Unreleased]: ${repoUrl}`;
  }

  const versionLinkLabels = [...new Set([tag, versionHeadingLabel])];
  const updateResult = updateReferenceLinks(changelog, versionLinkLabels, linkTarget, unreleasedLine);
  changelog = updateResult.changelog;

  deps.writeFileSync(changelogPath, changelog, 'utf8');
  deps.log(`✅ CHANGELOG.md updated for republish of ${tag}${repoUrl ? ` (${repoUrl})` : ''}`);
}

/**
 * CLI entry point - only runs when script is executed directly
 */
/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    try {
      const pkg = await import(join(process.cwd(), 'package.json'), { with: { type: 'json' } });
      const version = pkg.default.version;

      republishChangelog(version, {
        execSync,
        readFileSync,
        writeFileSync,
        getEnv: (key: string) => process.env[key],
        getCwd: () => process.cwd(),
        getDate: () => new Date().toISOString().split('T')[0],
        log: console.log,
        warn: console.warn,
      });
    } catch (error) {
      console.error(`❌ ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }

  main();
}
/* c8 ignore end */
