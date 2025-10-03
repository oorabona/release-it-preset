#!/usr/bin/env tsx
/**
 * Extract changelog entry for a specific version
 *
 * This script reads CHANGELOG.md and extracts the section for a given version.
 * Used primarily for generating GitHub release notes.
 *
 * Usage:
 *   tsx extract-changelog.ts <version>
 *
 * Example:
 *   tsx extract-changelog.ts 1.2.3
 *
 * Environment variables:
 *   CHANGELOG_FILE - Path to changelog file (default: CHANGELOG.md)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateAndNormalizeSemver } from './lib/semver-utils.js';
import { escapeRegExp } from './lib/string-utils.js';

export interface ExtractChangelogDeps {
  readFileSync: typeof readFileSync;
  getEnv: (key: string) => string | undefined;
  getCwd: () => string;
}

export function extractChangelog(version: string, deps: ExtractChangelogDeps): string {
  // Validate semver format
  const normalizedVersion = validateAndNormalizeSemver(version);
  const versionLabels = [`v${normalizedVersion}`, normalizedVersion];
  const tag = version.startsWith('v') ? version : `v${normalizedVersion}`;
  const changelogFile = deps.getEnv('CHANGELOG_FILE') || 'CHANGELOG.md';
  const changelogPath = join(deps.getCwd(), changelogFile);

  const changelog = deps.readFileSync(changelogPath, 'utf8') as string;

  const labelPattern = versionLabels.map(escapeRegExp).join('|');
  const versionBlock = new RegExp(
    `^(?<prefix>[^\n]*?##\\s*\\[?(?:${labelPattern})\\]?[^\n]*\r?\n)(?<content>[\\s\\S]*?)(?=^##\\s|^\\s*---\\s*$|$(?![\\s\\S]))`,
    'm',
  );

  const match = changelog.match(versionBlock);

  if (!match || !match.groups) {
    const humanLabels = versionLabels.map((label) => `[${label}]`).join(' or ');
    throw new Error(`No ${humanLabels} section found in ${changelogFile}`);
  }

  const versionContent = match.groups.content.trim();

  if (!versionContent) {
    throw new Error(`No changelog entry found for ${tag}`);
  }

  const entry = match[0].trim();
  return `# Release ${tag}\n\n${entry}`;
}

/**
 * CLI entry point - only runs when script is executed directly
 */
/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: tsx scripts/extract-changelog.ts <version>');
    process.exit(1);
  }

  try {
    const result = extractChangelog(version, {
      readFileSync,
      getEnv: (key: string) => process.env[key],
      getCwd: () => process.cwd(),
    });
    console.log(result);
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
/* c8 ignore end */
