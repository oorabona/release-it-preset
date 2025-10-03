/**
 * Conventional commit parsing utilities
 */

/**
 * Regex pattern for matching conventional commits
 * Matches: type(scope)?: description
 * Example: feat(api): add new endpoint
 */
export const CONVENTIONAL_COMMIT_REGEX = /^(\w+)(?:\(([^)]+)\))?(!)?\s*:\s*(.+)/m;

/**
 * Strict conventional commit types as defined by Conventional Commits specification
 * Used for strict validation in PR checks
 */
export const STRICT_CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'chore',
  'build',
  'ci',
  'revert',
] as const;

/**
 * Regex for strict conventional commit validation (only approved types)
 */
export const STRICT_CONVENTIONAL_COMMIT_REGEX = new RegExp(
  `^(${STRICT_CONVENTIONAL_TYPES.join('|')})(\\(.+\\))?:\\s.+`,
  'i'
);

/**
 * Check if a commit message matches conventional commit format (lenient)
 *
 * @param message Commit message to check
 * @returns true if message matches conventional format
 */
export function isConventionalCommit(message: string): boolean {
  return CONVENTIONAL_COMMIT_REGEX.test(message);
}

/**
 * Check if a commit message matches strict conventional commit format
 *
 * @param message Commit message to check
 * @returns true if message matches strict format
 */
export function isStrictConventionalCommit(message: string): boolean {
  return STRICT_CONVENTIONAL_COMMIT_REGEX.test(message);
}

/**
 * Extract conventional commit parts from a message
 *
 * @param message Commit message
 * @returns Parsed parts or null if not conventional
 */
export function parseConventionalCommit(message: string): {
  type: string;
  scope?: string;
  breaking: boolean;
  description: string;
} | null {
  const match = message.match(CONVENTIONAL_COMMIT_REGEX);

  if (!match) {
    return null;
  }

  const [, type, scope, breaking, description] = match;

  return {
    type: type.trim(),
    scope: scope?.trim(),
    breaking: Boolean(breaking),
    description: description.trim(),
  };
}
