#!/usr/bin/env tsx
/**
 * Validate project is ready for release
 *
 * This script checks:
 * - CHANGELOG.md exists and is well-formatted
 * - [Unreleased] section has content
 * - Working directory is clean (unless --allow-dirty)
 * - npm authentication works (npm whoami)
 * - Current branch is allowed (if GIT_REQUIRE_BRANCH is set)
 *
 * Usage:
 *   tsx validate-release.ts [--allow-dirty]
 *
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation failed
 */

import type { ExecSyncOptions } from 'node:child_process';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export interface ValidationResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface ValidateOptions {
  allowDirty: boolean;
}

export interface ValidateReleaseDeps {
  execSync: (command: string, options?: ExecSyncOptions) => Buffer | string;
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  getEnv: (key: string) => string | undefined;
}

export function parseArgs(argv: string[]): ValidateOptions {
  return {
    allowDirty: argv.includes('--allow-dirty'),
  };
}

export function validateChangelogExists(deps: ValidateReleaseDeps): ValidationResult {
  const path = deps.getEnv('CHANGELOG_FILE') || 'CHANGELOG.md';

  if (!deps.existsSync(path)) {
    return {
      name: 'CHANGELOG.md exists',
      passed: false,
      message: `File not found: ${path}`,
    };
  }

  return {
    name: 'CHANGELOG.md exists',
    passed: true,
  };
}

export function validateChangelogFormat(deps: ValidateReleaseDeps): ValidationResult {
  const path = deps.getEnv('CHANGELOG_FILE') || 'CHANGELOG.md';

  if (!deps.existsSync(path)) {
    return {
      name: 'CHANGELOG.md format',
      passed: false,
      message: 'File not found',
    };
  }

  const content = deps.readFileSync(path, 'utf8') as string;

  // Check for Keep a Changelog format markers
  const hasTitle = /^# /.test(content);
  const hasUnreleased = /## \[Unreleased\]/.test(content);
  const hasKeepAChangelogLink = /keepachangelog\.com/i.test(content);

  if (!hasTitle) {
    return {
      name: 'CHANGELOG.md format',
      passed: false,
      message: 'Missing title (# Changelog)',
    };
  }

  if (!hasUnreleased) {
    return {
      name: 'CHANGELOG.md format',
      passed: false,
      message: 'Missing [Unreleased] section',
    };
  }

  if (!hasKeepAChangelogLink) {
    return {
      name: 'CHANGELOG.md format',
      passed: false,
      message: 'Not using Keep a Changelog format (missing keepachangelog.com reference)',
    };
  }

  return {
    name: 'CHANGELOG.md format',
    passed: true,
  };
}

export function validateUnreleasedHasContent(deps: ValidateReleaseDeps): ValidationResult {
  const path = deps.getEnv('CHANGELOG_FILE') || 'CHANGELOG.md';

  if (!deps.existsSync(path)) {
    return {
      name: '[Unreleased] has content',
      passed: false,
      message: 'CHANGELOG.md not found',
    };
  }

  const content = deps.readFileSync(path, 'utf8') as string;
  const unreleasedMatch = content.match(/## \[Unreleased\]([\s\S]*?)(?=## \[|$)/);

  if (!unreleasedMatch) {
    return {
      name: '[Unreleased] has content',
      passed: false,
      message: '[Unreleased] section not found',
    };
  }

  const unreleasedContent = unreleasedMatch[1].trim();

  if (!unreleasedContent || unreleasedContent === 'No changes yet.') {
    return {
      name: '[Unreleased] has content',
      passed: false,
      message: '[Unreleased] section is empty',
    };
  }

  // Check if there's at least one change entry (starts with -)
  const hasChanges = /^-/m.test(unreleasedContent);

  if (!hasChanges) {
    return {
      name: '[Unreleased] has content',
      passed: false,
      message: '[Unreleased] section has no change entries',
    };
  }

  return {
    name: '[Unreleased] has content',
    passed: true,
  };
}

export function validateWorkingDirectoryClean(deps: ValidateReleaseDeps, options: ValidateOptions): ValidationResult {
  if (options.allowDirty) {
    return {
      name: 'Working directory clean',
      passed: true,
      message: 'Skipped (--allow-dirty)',
    };
  }

  try {
    const status = (deps.execSync('git status --porcelain', { encoding: 'utf8' }) as string).trim();

    if (status) {
      return {
        name: 'Working directory clean',
        passed: false,
        message: 'Uncommitted changes detected. Use --allow-dirty to skip this check.',
      };
    }

    return {
      name: 'Working directory clean',
      passed: true,
    };
  } catch (error) {
    return {
      name: 'Working directory clean',
      passed: false,
      message: `Failed to check git status: ${error}`,
    };
  }
}

export function validateNpmAuth(deps: ValidateReleaseDeps): ValidationResult {
  try {
    const username = (deps.execSync('npm whoami', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) as string).trim();

    return {
      name: 'npm authentication',
      passed: true,
      message: `Logged in as: ${username}`,
    };
  } catch (error) {
    const tokenEnvVars = ['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'NPM_CONFIG__AUTH', 'NPM_CONFIG_TOKEN'];
    const hasAutomationToken = tokenEnvVars.some((name) => {
      const value = deps.getEnv(name);
      return typeof value === 'string' && value.trim().length > 0;
    });

    if (hasAutomationToken) {
      return {
        name: 'npm authentication',
        passed: true,
        message: 'Token-based authentication detected (skipped npm whoami).',
      };
    }

    const ciEnv = deps.getEnv('CI');
    if (ciEnv && ciEnv.toLowerCase() === 'true') {
      return {
        name: 'npm authentication',
        passed: false,
        message: 'npm whoami failed in CI and no auth token detected. Ensure NPM_TOKEN is configured.',
      };
    }

    return {
      name: 'npm authentication',
      passed: false,
      message: 'Not authenticated. Run: npm login',
    };
  }
}

export function validateBranch(deps: ValidateReleaseDeps): ValidationResult {
  const requiredBranch = deps.getEnv('GIT_REQUIRE_BRANCH');

  if (!requiredBranch) {
    return {
      name: 'Branch check',
      passed: true,
      message: 'Skipped (GIT_REQUIRE_BRANCH not set)',
    };
  }

  try {
    const currentBranch = (deps.execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }) as string).trim();

    if (currentBranch !== requiredBranch) {
      return {
        name: 'Branch check',
        passed: false,
        message: `Current branch is "${currentBranch}", but "${requiredBranch}" is required`,
      };
    }

    return {
      name: 'Branch check',
      passed: true,
      message: `On required branch: ${currentBranch}`,
    };
  } catch (error) {
    return {
      name: 'Branch check',
      passed: false,
      message: `Failed to get current branch: ${error}`,
    };
  }
}

export function validateGitRepo(deps: ValidateReleaseDeps): ValidationResult {
  try {
    deps.execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    return {
      name: 'Git repository',
      passed: true,
    };
  } catch {
    return {
      name: 'Git repository',
      passed: false,
      message: 'Not a git repository',
    };
  }
}

export function validateRelease(deps: ValidateReleaseDeps, options: ValidateOptions): ValidationResult[] {
  return [
    validateGitRepo(deps),
    validateChangelogExists(deps),
    validateChangelogFormat(deps),
    validateUnreleasedHasContent(deps),
    validateWorkingDirectoryClean(deps, options),
    validateBranch(deps),
    validateNpmAuth(deps),
  ];
}

/**
 * CLI entry point - only runs when script is executed directly
 */
/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const options = parseArgs(process.argv.slice(2));

    console.log('🔍 Validating release readiness...\n');

    const deps: ValidateReleaseDeps = {
      execSync,
      existsSync,
      readFileSync,
      getEnv: (key: string) => process.env[key],
    };

    const results = validateRelease(deps, options);

    let allPassed = true;

    for (const result of results) {
      const icon = result.passed ? '✅' : '❌';
      const status = result.passed ? 'PASS' : 'FAIL';
      console.log(`${icon} ${result.name}: ${status}`);
      if (result.message) {
        console.log(`   ${result.message}`);
      }
      if (!result.passed) {
        allPassed = false;
      }
    }

    console.log();

    if (allPassed) {
      console.log('✨ All validations passed! Ready to release.');
      process.exit(0);
    } else {
      console.log('❌ Some validations failed. Please fix the issues above before releasing.');
      process.exit(1);
    }
  }

  main().catch((error) => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}
/* c8 ignore end */
