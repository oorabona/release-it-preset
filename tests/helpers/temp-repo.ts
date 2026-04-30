/**
 * Helpers for creating real temporary git repositories in E2E tests.
 *
 * All git and filesystem operations are synchronous to keep tests simple and
 * match the execSync style used by the production scripts.
 *
 * Safe env defaults injected by runCli():
 *   GITHUB_RELEASE=false  NPM_PUBLISH=false  NPM_SKIP_CHECKS=true
 *   GIT_REQUIRE_UPSTREAM=false  GIT_REQUIRE_CLEAN=false  CI=true
 *   NPM_TOKEN=dummy-e2e-token (bypasses `npm whoami` via the CI auth-token path)
 */

import { execFileSync, spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

/** Path to the CLI entry point, resolved relative to this helper file. */
const CLI_PATH = fileURLToPath(new URL('../../bin/cli.js', import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TempRepoOpts {
  /** Default branch name. Falls back to 'main'. */
  branch?: string
}

export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface TempRepo {
  /** Absolute path to the temporary repository root. */
  cwd: string
  /** Create a commit, optionally writing files first. Allows empty commits. */
  commit(message: string, files?: Record<string, string>): void
  /** Create a lightweight tag `v<version>`. */
  tag(version: string): void
  /** Run `node bin/cli.js <...args>` in the temp repo and return captured output. */
  runCli(args: string[], env?: NodeJS.ProcessEnv): CliResult
  /** Remove the temp directory. Safe to call multiple times. */
  cleanup(): void
}

// ---------------------------------------------------------------------------
// Orphan-cleanup safety net (registered once per module)
// ---------------------------------------------------------------------------

/** Tracks every directory created by createTempGitRepo for orphan cleanup. */
const openDirs = new Set<string>()

let exitHandlerRegistered = false

function registerExitHandler() {
  if (exitHandlerRegistered) return
  exitHandlerRegistered = true
  process.on('exit', () => {
    for (const dir of openDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // best-effort; never throw in exit handler
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Core factory
// ---------------------------------------------------------------------------

/**
 * Create a temporary git repository with repo-local config only.
 * The directory is cleaned up automatically on process exit as a safety net.
 */
export function createTempGitRepo(opts: TempRepoOpts = {}): TempRepo {
  registerExitHandler()

  const branch = opts.branch ?? 'main'
  const cwd = mkdtempSync(join(tmpdir(), 'release-it-preset-e2e-'))
  openDirs.add(cwd)

  // git init — try -b first, fall back for older git versions
  try {
    execFileSync('git', ['init', '-b', branch], { cwd, stdio: 'pipe' })
  } catch {
    execFileSync('git', ['init'], { cwd, stdio: 'pipe' })
    // Need an initial commit before we can rename the branch
    writeFileSync(join(cwd, '.gitkeep'), '', 'utf8')
    execFileSync('git', ['add', '.gitkeep'], { cwd, stdio: 'pipe' })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd, stdio: 'pipe' })
    execFileSync('git', ['config', 'user.name', 'E2E Test'], { cwd, stdio: 'pipe' })
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', 'init', '--allow-empty'], { cwd, stdio: 'pipe' })
    execFileSync('git', ['checkout', '-b', branch], { cwd, stdio: 'pipe' })
  }

  // Repo-local identity — never touch --global config
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.name', 'E2E Test'], { cwd, stdio: 'pipe' })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd, stdio: 'pipe' })

  // Remote needed by populate's commit-link generation; never pushed to
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/demo-e2e.git'], {
    cwd,
    stdio: 'pipe',
  })

  // Default safe environment for CLI invocations.
  // NPM_TOKEN=dummy bypasses `npm whoami` in validate-release (CI auth token path).
  // CI=true (not '1') matches the validate-release ciEnv check (toLowerCase() === 'true').
  // GITHUB_REPOSITORY is forced empty so getGitHubRepoUrl() falls back to the temp
  // repo's `origin` remote (https://github.com/example/demo-e2e.git). Without this,
  // CI runners leak GITHUB_REPOSITORY=<owner>/<repo> into the test environment and
  // populate-unreleased-changelog generates links pointing at the wrong project,
  // making the commit-link assertion in hotfix.test.ts fail in CI but pass locally.
  const defaultEnv: NodeJS.ProcessEnv = {
    GITHUB_RELEASE: 'false',
    NPM_PUBLISH: 'false',
    NPM_SKIP_CHECKS: 'true',
    GIT_REQUIRE_UPSTREAM: 'false',
    GIT_REQUIRE_CLEAN: 'false',
    CI: 'true',
    NPM_TOKEN: 'dummy-e2e-token',
    GITHUB_REPOSITORY: '',
  }

  const repo: TempRepo = {
    cwd,

    commit(message: string, files?: Record<string, string>) {
      if (files) {
        for (const [filePath, content] of Object.entries(files)) {
          const fullPath = join(cwd, filePath)
          mkdirSync(dirname(fullPath), { recursive: true })
          writeFileSync(fullPath, content, 'utf8')
        }
      }
      execFileSync('git', ['add', '-A'], { cwd, stdio: 'pipe' })
      execFileSync('git', ['commit', '-m', message, '--allow-empty'], { cwd, stdio: 'pipe' })
    },

    tag(version: string) {
      execFileSync('git', ['tag', `v${version}`], { cwd, stdio: 'pipe' })
    },

    runCli(args: string[], env?: NodeJS.ProcessEnv): CliResult {
      const mergedEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ...defaultEnv,
        ...(env ?? {}),
      }

      const spawnOpts: SpawnSyncOptionsWithStringEncoding = {
        cwd,
        env: mergedEnv,
        encoding: 'utf8',
        timeout: 30_000,
      }

      const result = spawnSync(process.execPath, [CLI_PATH, ...args], spawnOpts)

      // spawnSync returns null status on signal / timeout
      const exitCode = result.status ?? 1

      return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode,
      }
    },

    cleanup() {
      openDirs.delete(cwd)
      rmSync(cwd, { recursive: true, force: true })
    },
  }

  return repo
}

// ---------------------------------------------------------------------------
// Convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Run a callback with a fresh temporary git repo, cleaning up regardless of
 * whether the callback throws.
 */
export async function withTempGitRepo<T>(fn: (repo: TempRepo) => T | Promise<T>): Promise<T> {
  const repo = createTempGitRepo()
  try {
    return await fn(repo)
  } finally {
    repo.cleanup()
  }
}
