/**
 * Configurable commit-type → CHANGELOG section mapping.
 *
 * Resolution order (highest priority wins):
 *   1. CHANGELOG_TYPE_MAP env var  (JSON string)
 *   2. .changelog-types.json file  (project root)
 *   3. Built-in defaults below
 *
 * A value of `false` means "skip this type entirely" (no changelog entry).
 */

import type { readFileSync as ReadFileSyncFn } from 'node:fs';

/**
 * Dependencies for loadChangelogTypeMap — follows the project DI pattern.
 */
export interface ChangelogTypeDeps {
  readFileSync: typeof ReadFileSyncFn;
  getEnv: (key: string) => string | undefined;
  warn: (message: string) => void;
}

/**
 * Built-in commit-type → CHANGELOG section map.
 * Values are `### SectionName` strings or `false` to suppress.
 */
export const BUILTIN_TYPE_MAP: Record<string, string | false> = {
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

const CHANGELOG_TYPES_FILE = '.changelog-types.json';

/**
 * Validate that every value in the map is either a string or false.
 * Throws on the first invalid entry.
 */
function validateMapStructure(map: unknown): asserts map is Record<string, string | false> {
  if (typeof map !== 'object' || map === null || Array.isArray(map)) {
    throw new TypeError('Type map must be a plain object');
  }
  for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
    if (typeof value !== 'string' && value !== false) {
      throw new TypeError(
        `Invalid value for key "${key}": expected string or false, got ${typeof value}`,
      );
    }
  }
}

/**
 * Load the commit-type → CHANGELOG section mapping.
 *
 * Priority:
 *  1. CHANGELOG_TYPE_MAP env var (JSON, merged on top of file + built-in)
 *  2. .changelog-types.json project file (merged on top of built-in)
 *  3. BUILTIN_TYPE_MAP (base)
 *
 * Malformed JSON or invalid structure → WARN + ignore that layer (fall back to lower priority).
 */
export function loadChangelogTypeMap(deps: ChangelogTypeDeps): Record<string, string | false> {
  let resolved: Record<string, string | false> = { ...BUILTIN_TYPE_MAP };

  // Layer 1: project-level file override
  let fileContent: string | undefined;
  try {
    fileContent = deps.readFileSync(CHANGELOG_TYPES_FILE, 'utf8') as string;
  } catch {
    // File does not exist — not an error, just skip
    fileContent = undefined;
  }

  if (fileContent !== undefined) {
    try {
      const parsed: unknown = JSON.parse(fileContent);
      validateMapStructure(parsed);
      resolved = { ...resolved, ...parsed };
    } catch (err) {
      deps.warn(
        `Invalid ${CHANGELOG_TYPES_FILE}: ${(err as Error).message}. Using built-in type map.`,
      );
    }
  }

  // Layer 2: env var override (highest priority)
  const envValue = deps.getEnv('CHANGELOG_TYPE_MAP');
  if (envValue) {
    try {
      const parsed: unknown = JSON.parse(envValue);
      validateMapStructure(parsed);
      resolved = { ...resolved, ...parsed };
    } catch (err) {
      deps.warn(
        `Invalid CHANGELOG_TYPE_MAP env var: ${(err as Error).message}. Using file/built-in type map.`,
      );
    }
  }

  return resolved;
}
