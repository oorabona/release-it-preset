/**
 * String utility functions shared across scripts
 */

/**
 * Escape special regex characters in a string
 *
 * @param input String to escape
 * @returns Escaped string safe for use in RegExp
 */
export function escapeRegExp(input: string): string {
  return input.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
