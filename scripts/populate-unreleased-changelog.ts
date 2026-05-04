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
import { runScript } from './lib/run-script.js';
import { ValidationError } from './lib/errors.js';
import { BUILTIN_TYPE_MAP, loadChangelogTypeMap } from './lib/changelog-types.js';

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
 * Normalize a commit type to a CHANGELOG section heading.
 * Uses `typeMap` (defaults to BUILTIN_TYPE_MAP) so callers can inject
 * a custom or project-level override without touching this function.
 * Returns false when the type should be suppressed entirely.
 */
export function normalizeCommitType(
  type: string,
  typeMap: Record<string, string | false> = BUILTIN_TYPE_MAP,
): string | false {
  const result = typeMap[type.toLowerCase()];
  return result !== undefined ? result : '### Changed';
}


/**
 * Parse git log output and extract all conventional commit parts
 */
export function parseCommitsWithMultiplePrefixes(
  gitOutput: string,
  repoUrl: string,
  typeMap: Record<string, string | false> = BUILTIN_TYPE_MAP,
): string {
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

      // Compute the header block: first contiguous run of non-empty lines.
      // This prevents paragraph-separated footer tokens like "Refs: #42" or
      // "Co-authored-by: ..." from matching the conventional-commit regex
      // via the 'gm' flag in extractConventionalCommitParts. Consecutive
      // multi-prefix lines (e.g. "feat: x\nfix: y") are preserved because
      // they share no blank line — see #23 for the original use case.
      const headerBlock = body.split('\n').reduce(
        (acc, line) => {
          if (!acc.done) {
            if (line.trim() === '') {
              acc.done = true;
            } else {
              acc.lines.push(line);
            }
          }
          return acc;
        },
        { lines: [] as string[], done: false },
      ).lines.join('\n');

      const parts = extractConventionalCommitParts(headerBlock, shortSha);

      // Detect "BREAKING CHANGE:" trailers only in the LAST paragraph of the body,
      // AND only when the body has more than one paragraph (i.e., there is at least one
      // blank-line separator). Per Conventional Commits 1.0.0 §6, a footer requires a
      // blank line separating it from the preceding content. A "BREAKING CHANGE:" that
      // appears on a line immediately after the subject line (no blank line) is mid-body
      // prose, NOT a footer, and must NOT promote the commit to breaking.
      //
      // matchAll() is used so multiple BREAKING CHANGE: lines in the same last
      // paragraph each emit a separate breaking entry.
      // CRLF safety: accept both LF and CRLF line endings so commits authored on
      // Windows produce the same output (a paragraph separator can be \n\n or \r\n\r\n).
      const paragraphs = body.split(/\r?\n[ \t]*\r?\n/);
      const hasFooterSection = paragraphs.length > 1;
      const breakingFooterMatches = hasFooterSection
        ? [...(paragraphs[paragraphs.length - 1] ?? '').matchAll(/^BREAKING[- ]CHANGE:\s*(.+)$/gm)]
        : [];

      if (breakingFooterMatches.length > 0) {
        if (parts.length > 0) {
          // Promote the first conventional-commit part to breaking so it appears in
          // the BREAKING CHANGES section with the commit's own description.
          parts[0] = { ...parts[0], breaking: true };
        }
        // Each BREAKING CHANGE: footer line emits its own breaking entry with the
        // footer's description (distinct from the commit subject).
        // Multiple footer lines → multiple entries.
        for (const m of breakingFooterMatches) {
          parts.push({
            type: 'misc',
            description: m[1].trim(),
            sha: shortSha,
            breaking: true,
          });
        }
      }

      if (parts.length === 0) {
        const firstLine = body.split('\n')[0].trim();
        if (firstLine) {
          const lowerFirstLine = firstLine.toLowerCase();
          const ignoredPatterns = [
            /^release\b/,
            /^hotfix\b/,
            /^ci\b/,
            /^chore\(release\)/i,
            /^chore\(hotfix\)/i,
            /^chore\(ci\)/i,
          ];
          const shouldSkip = ignoredPatterns.some((pattern) => pattern.test(lowerFirstLine));

          if (shouldSkip) {
            continue;
          }

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
    // Breaking parts go ONLY into the BREAKING CHANGES section.
    // They are NOT also added to their native section (e.g. ### Added), which
    // would produce duplicate entries. The breaking indicator in the native
    // section was confusing — the dedicated ### ⚠️ BREAKING CHANGES section
    // already provides full visibility.
    if (part.breaking) {
      breakingChanges.push(part);
      continue;
    }

    const sectionName = normalizeCommitType(part.type, typeMap);
    if (sectionName === false) {
      continue;
    }
    if (!groupedParts[sectionName]) {
      groupedParts[sectionName] = [];
    }
    groupedParts[sectionName].push(part);
  }

  // Build the final ordered section list.
  // Custom sections (from typeMap overrides) are appended after the standard order.
  const sections: string[] = [];
  const standardSectionOrder = [
    '### Added',
    '### Changed',
    '### Deprecated',
    '### Removed',
    '### Fixed',
    '### Security',
  ];

  // Collect any custom section names not in the standard order
  const customSections = Object.keys(groupedParts).filter(
    (s) => !standardSectionOrder.includes(s),
  );
  const sectionOrder = [...standardSectionOrder, ...customSections];

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
          const linkPart = repoUrl ? ` ([${part.sha}](${repoUrl}/commit/${part.sha}))` : ` (${part.sha})`;
          return `- ${part.description}${scopePart}${linkPart}`;
        })
      );
      sections.push('');
    }
  }

  return sections.length > 0 ? sections.join('\n').trim() : 'No changes yet.';
}

/**
 * Resolve the `since` baseline for changelog generation.
 *
 * Priority:
 * 1. GIT_CHANGELOG_SINCE env var (any git ref — trust the user)
 * 2. Per-package detection via `chore(<pkg>): release v` commit when GIT_CHANGELOG_PATH is set
 * 3. Fallback: `git describe --tags --abbrev=0`
 */
export function resolveSinceBaseline(deps: PopulateChangelogDeps): string {
  // 1. Explicit override wins
  const sinceOverride = deps.getEnv('GIT_CHANGELOG_SINCE');
  if (sinceOverride && sinceOverride.trim()) {
    deps.log(`ℹ️  Using GIT_CHANGELOG_SINCE override: ${sinceOverride.trim()}`);
    return sinceOverride.trim();
  }

  // 2. Per-package detection: only when running scoped to a subdir
  const path = deps.getEnv('GIT_CHANGELOG_PATH');
  if (path && path.trim()) {
    let pkgName = '';
    try {
      const pkgJsonRaw = deps.readFileSync('package.json', 'utf8') as string;
      const pkgNameFull = (JSON.parse(pkgJsonRaw) as { name?: string }).name;
      if (pkgNameFull) {
        pkgName = pkgNameFull.startsWith('@')
          ? (pkgNameFull.split('/').pop() ?? '')
          : pkgNameFull;
      }
    } catch {
      // package.json missing or unreadable — skip per-package detection
    }
    if (pkgName) {
      try {
        const sha = (
          deps.execSync(
            `git log --grep="^chore(${pkgName}): release v" -n 1 --pretty=format:"%H"`,
            { encoding: 'utf8' },
          ) as string
        ).trim();
        if (sha) {
          deps.log(
            `ℹ️  Per-package baseline (chore(${pkgName}): release …): ${sha.substring(0, 7)}`,
          );
          return sha;
        }
      } catch {
        // fall through to tag fallback
      }
    }
  }

  // 3. Fallback: existing git describe behavior
  try {
    const tag = (
      deps.execSync('git describe --tags --abbrev=0 2>/dev/null', { encoding: 'utf8' }) as string
    ).trim();
    deps.log(`ℹ️  Latest tag: ${tag}`);
    return tag;
  } catch {
    deps.log('ℹ️  No tags found, using all commits');
    return '';
  }
}


/**
 * Main function to populate changelog with dependency injection
 */
export function populateChangelog(deps: PopulateChangelogDeps): void {
  const changelogPath = deps.getEnv('CHANGELOG_FILE') || 'CHANGELOG.md';

  deps.log('📝 Populating [Unreleased] section...');

  const since = resolveSinceBaseline(deps);

  const gitChangelogPath = deps.getEnv('GIT_CHANGELOG_PATH');
  let pathFilter = '';
  if (gitChangelogPath !== undefined && gitChangelogPath !== '') {
    // Validate: must be a relative path — no leading slash, no ".." segments, no shell metacharacters
    if (
      gitChangelogPath.startsWith('/') ||
      /(^|[/\\])\.\.([/\\]|$)/.test(gitChangelogPath) ||
      /[`$;&|<>{}()\\*?!#"']/.test(gitChangelogPath)
    ) {
      throw new ValidationError(
        `GIT_CHANGELOG_PATH must be a relative path under the repository (got: ${gitChangelogPath})`
      );
    }
    pathFilter = ` -- ${gitChangelogPath}`;
  }

  const gitLogCommand = since
    ? `git log --pretty=format:"%H|%B|||END|||" ${since}..HEAD${pathFilter}`
    : `git log --pretty=format:"%H|%B|||END|||"${pathFilter}`;

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
  const typeMap = loadChangelogTypeMap({
    readFileSync: deps.readFileSync,
    getEnv: deps.getEnv,
    warn: deps.warn,
  });
  const commits = parseCommitsWithMultiplePrefixes(gitOutput, repoUrl, typeMap);
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
  void runScript(
    { error: console.error, exit: process.exit },
    () =>
      populateChangelog({
        execSync,
        readFileSync,
        writeFileSync,
        getEnv: (key: string) => process.env[key],
        log: console.log,
        warn: console.warn,
        error: console.error,
      }),
  );
}
/* c8 ignore end */
