/**
 * Typed error hierarchy for script-level failures.
 *
 * Each subclass maps to a specific CLI exit code so that callers and
 * the `runScript()` wrapper can surface the right exit code without
 * inspecting raw strings.
 *
 * Usage:
 *   throw new ValidationError('CHANGELOG.md not found')
 *   // → exits with code 2
 *
 *   throw new GitError('git tag not found')
 *   // → exits with code 1
 */

/**
 * Base class for all script-level errors that map to a CLI exit code.
 * Throw a subclass to signal a specific failure mode; uncaught throws
 * fall through to exit code 1 via runScript().
 */
export class ScriptError extends Error {
  readonly exitCode: number

  constructor(message: string, options?: { exitCode?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = this.constructor.name
    this.exitCode = options?.exitCode ?? 1
  }
}

/** Pre-flight or input-validation failure (e.g. missing CHANGELOG, wrong branch, dirty tree). Exit 2. */
export class ValidationError extends ScriptError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { exitCode: 2, cause: options?.cause })
  }
}

/** Git operation failure (tag not found, command non-zero, parse error on git output). Exit 1. */
export class GitError extends ScriptError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { exitCode: 1, cause: options?.cause })
  }
}

/** Changelog parse/write failure (malformed file, missing [Unreleased], etc.). Exit 1. */
export class ChangelogError extends ScriptError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { exitCode: 1, cause: options?.cause })
  }
}
