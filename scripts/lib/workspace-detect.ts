/**
 * Workspace detection utilities for pnpm-workspace.yaml and package.json#workspaces.
 *
 * Scope: block-list `packages:` in pnpm-workspace.yaml only.
 * Flow-style arrays ( packages: [...] ) are rejected with a clear error.
 * Block-list of strings supported. Flow-style arrays AND alias references (`*alias`) are
 * rejected with `ValidationError`. Anchors (`&name`) on entries are silently treated as
 * opaque pattern strings.
 *
 * All functions are pure (no direct FS access) — dependencies are injected for testability.
 */

import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ValidationError } from './errors.js';

export interface WorkspaceDetectDeps {
  existsSync: (path: string) => boolean;
  readdirSync: (path: string) => string[];
}

/**
 * Parse the `packages:` block-list section of a pnpm-workspace.yaml file.
 *
 * Only block-sequence form is supported:
 *   packages:
 *     - 'packages/*'
 *     - 'apps/*'
 *
 * Flow-style arrays ( packages: ['a', 'b'] ) are rejected with a ValidationError
 * pointing users toward the block-list form.
 *
 * @param content - Raw YAML file content
 * @returns Array of glob patterns from the packages: block-list, or empty array if no packages: key found
 * @throws ValidationError if flow-style array syntax is detected
 */
export function parsePnpmWorkspaceYaml(content: string): string[] {
  const lines = content.split('\n');

  // Find the `packages:` key
  const packagesLineIdx = lines.findIndex(l => /^packages\s*:/.test(l));
  if (packagesLineIdx === -1) {
    return [];
  }

  // Check for unsupported syntax on the same line
  const packagesLine = lines[packagesLineIdx];

  // Flow-style arrays: packages: ['a', 'b'] or packages: [a, b]
  if (/^packages\s*:\s*\[/.test(packagesLine)) {
    throw new ValidationError(
      `pnpm-workspace.yaml uses flow-style array for "packages:" which is not supported.\n` +
      `Please convert to block-list form:\n` +
      `  packages:\n` +
      `    - 'packages/*'\n` +
      `    - 'apps/*'\n` +
      `If you need flow-style support, open an issue at https://github.com/oorabona/release-it-preset/issues`
    );
  }

  // YAML alias reference: packages: *anchorName
  if (/^packages\s*:\s*\*\S+/.test(packagesLine)) {
    throw new ValidationError(
      `pnpm-workspace.yaml uses a YAML alias reference for "packages:" which is not supported.\n` +
      `Please convert to block-list form:\n` +
      `  packages:\n` +
      `    - 'packages/*'\n` +
      `    - 'apps/*'\n` +
      `Anchor/alias support is not planned; if you need it, open an issue at https://github.com/oorabona/release-it-preset/issues`
    );
  }

  // Collect subsequent indented list items (- '...' or - "..." or - bare)
  const patterns: string[] = [];
  for (let i = packagesLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop if we hit a non-indented, non-empty line (new top-level key)
    if (line.length > 0 && !/^\s/.test(line)) {
      break;
    }
    // Match a block-sequence item
    const match = line.match(/^\s+-\s+['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/);
    if (match) {
      patterns.push(match[1].trim());
    }
  }

  return patterns;
}

/**
 * Parse the `workspaces` field from a package.json content string.
 *
 * Supports:
 *   "workspaces": ["packages/*"]           — array form
 *   "workspaces": {"packages": [...]}      — object form (Yarn-style)
 *
 * @param content - Raw package.json content
 * @returns Array of glob patterns, or empty array if workspaces not present
 */
export function parseWorkspacesFromPackageJson(content: string): string[] {
  let pkg: unknown;
  try {
    pkg = JSON.parse(content);
  } catch {
    return [];
  }

  if (typeof pkg !== 'object' || pkg === null || !('workspaces' in pkg)) {
    return [];
  }

  const ws = (pkg as Record<string, unknown>).workspaces;

  if (Array.isArray(ws)) {
    return ws.filter((v): v is string => typeof v === 'string');
  }

  if (typeof ws === 'object' && ws !== null && 'packages' in ws) {
    const pkgs = (ws as Record<string, unknown>).packages;
    if (Array.isArray(pkgs)) {
      return pkgs.filter((v): v is string => typeof v === 'string');
    }
  }

  return [];
}

/**
 * Expand glob patterns to resolved package directories that contain a package.json.
 *
 * Only supports single-level glob expansion: `packages/*` expands to immediate
 * children of `packages/`. Nested globs (`packages/*\/src`) are not supported
 * and are returned as-is only if the literal path has a package.json.
 *
 * Each resolved path is validated to be contained within projectRoot using
 * path.resolve + path.relative containment check. Paths escaping the root
 * (e.g. `../etc`) throw a ValidationError.
 *
 * @param patterns - Glob patterns from workspace config
 * @param projectRoot - Absolute path to the project root
 * @param deps - Injected FS dependencies
 * @returns Array of absolute paths to valid package directories
 */
export function resolvePackagePaths(
  patterns: string[],
  projectRoot: string,
  deps: WorkspaceDetectDeps
): string[] {
  const result: string[] = [];

  for (const pattern of patterns) {
    const resolved = resolve(projectRoot, pattern);

    // Containment check: relative path must NOT start with '..' or be absolute
    // (isAbsolute guard handles Windows cross-drive paths where relative() returns
    //  an absolute path that doesn't start with '..', bypassing the startsWith check)
    const rel = relative(projectRoot, resolved);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
      throw new ValidationError(
        `Workspace pattern "${pattern}" resolves outside the project root.\n` +
        `Resolved: ${resolved}\n` +
        `Project root: ${projectRoot}\n` +
        `Each workspace package must live under the project root.`
      );
    }

    // Single-level glob expansion: path ends with /*
    if (pattern.endsWith('/*')) {
      const parentDir = resolve(projectRoot, pattern.slice(0, -2));

      // Containment check on the parent dir too (same isAbsolute guard)
      const parentRel = relative(projectRoot, parentDir);
      if (isAbsolute(parentRel) || parentRel === '..' || parentRel.startsWith(`..${sep}`)) {
        throw new ValidationError(
          `Workspace pattern "${pattern}" resolves outside the project root.\n` +
          `Resolved parent: ${parentDir}\n` +
          `Project root: ${projectRoot}\n` +
          `Each workspace package must live under the project root.`
        );
      }

      if (!deps.existsSync(parentDir)) {
        continue;
      }

      let entries: string[];
      try {
        entries = deps.readdirSync(parentDir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const pkgDir = join(parentDir, entry);
        const pkgJson = join(pkgDir, 'package.json');
        if (deps.existsSync(pkgJson)) {
          result.push(pkgDir);
        }
      }
    } else {
      // Non-glob: treat as literal directory path
      const pkgJson = join(resolved, 'package.json');
      if (deps.existsSync(pkgJson)) {
        result.push(resolved);
      }
    }
  }

  return result;
}
