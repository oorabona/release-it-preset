#!/usr/bin/env tsx
/**
 * Check pull request hygiene (changelog + commits)
 *
 * This script inspects the current git workspace to determine whether:
 * - The changelog (respecting CHANGELOG_FILE env override) has been modified
 * - A `[skip-changelog]` marker appears in commit messages
 * - Commits follow the conventional commit format
 *
 * Results are written to `$GITHUB_OUTPUT` when available so GitHub Actions steps
 * can consume them without relying on continue-on-error semantics.
 */

import type { ExecSyncOptions } from 'node:child_process'
import { execSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { STRICT_CONVENTIONAL_COMMIT_REGEX } from './lib/commit-parser.js'

export type ChangelogStatus = 'updated' | 'skipped' | 'missing'

export interface PrCheckResult {
  baseRef: string | null
  headRef: string
  changedFiles: string[]
  commits: string[]
  changelogStatus: ChangelogStatus
  skipChangelogMarker: boolean
  hasConventionalCommits: boolean
}

export interface PrCheckDeps {
  execSync: (command: string, options?: ExecSyncOptions) => Buffer | string
  getEnv: (key: string) => string | undefined
  writeOutput: (name: string, value: string) => void
  log: (message: string) => void
  warn: (message: string) => void
}

const SKIP_CHANGELOG_REGEX = /\[skip-changelog]/i

export function safeExec(command: string, deps: PrCheckDeps): string | null {
  try {
    return (deps.execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) as string).trim()
  } catch (error) {
    deps.warn(`⚠️  Command failed: ${command}\n${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

export function normalizeBaseRef(baseRef: string | null | undefined): string | null {
  if (!baseRef || baseRef.trim() === '') {
    return null
  }
  const trimmed = baseRef.trim()
  if (trimmed.includes('/') || trimmed.startsWith('refs/')) {
    return trimmed
  }
  return `origin/${trimmed}`
}

export function parseArgs(argv: string[]): { base: string | null; head: string | null } {
  let base: string | null = null
  let head: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--base' && argv[i + 1]) {
      base = argv[++i]
      continue
    }
    if (arg === '--head' && argv[i + 1]) {
      head = argv[++i]
      continue
    }
  }

  return { base, head }
}

export function splitList(value: string | null): string[] {
  if (!value) {
    return []
  }
  return value
    .split('\n')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
}

export function hasSkipChangelog(commits: string[]): boolean {
  return commits.some(commit => SKIP_CHANGELOG_REGEX.test(commit))
}

export function hasConventionalCommits(commits: string[]): boolean {
  return commits.some(commit => STRICT_CONVENTIONAL_COMMIT_REGEX.test(commit))
}

export function evaluateChangelogStatus(
  changedFiles: string[],
  changelogPath: string,
  commits: string[],
): { status: ChangelogStatus; skipMarker: boolean } {
  const changelogFile = changelogPath || 'CHANGELOG.md'
  const normalizedChangelog = changelogFile.trim()
  const skipMarker = hasSkipChangelog(commits)

  if (changedFiles.includes(normalizedChangelog)) {
    return { status: 'updated', skipMarker }
  }

  if (skipMarker) {
    return { status: 'skipped', skipMarker }
  }

  return { status: 'missing', skipMarker }
}

export function getDiffRange(baseRef: string | null, headRef: string): string {
  if (!baseRef) {
    return headRef
  }
  return `${baseRef}..${headRef}`
}

export function runPrCheck(args: { base?: string | null; head?: string | null }, deps: PrCheckDeps): PrCheckResult {
  const envBase = deps.getEnv('PR_BASE_REF') ?? deps.getEnv('GITHUB_BASE_REF') ?? null
  const envHead = deps.getEnv('PR_HEAD_REF') ?? deps.getEnv('GITHUB_HEAD_REF') ?? null

  const baseRef = normalizeBaseRef(args.base ?? envBase)
  const headRef = (args.head ?? envHead ?? 'HEAD').trim() || 'HEAD'
  const diffRange = getDiffRange(baseRef, headRef)

  const changedFilesOutput = safeExec(
    baseRef ? `git diff --name-only ${diffRange}` : `git diff --name-only ${headRef}`,
    deps,
  )
  const changedFiles = splitList(changedFilesOutput)

  const commitsOutput = safeExec(
    baseRef ? `git log ${diffRange} --pretty=format:%s` : `git log ${headRef} --pretty=format:%s`,
    deps,
  )
  const commits = splitList(commitsOutput)

  const changelogPath = deps.getEnv('CHANGELOG_FILE') ?? 'CHANGELOG.md'
  const changelogEvaluation = evaluateChangelogStatus(changedFiles, changelogPath, commits)
  const conventional = hasConventionalCommits(commits)

  return {
    baseRef,
    headRef,
    changedFiles,
    commits,
    changelogStatus: changelogEvaluation.status,
    skipChangelogMarker: changelogEvaluation.skipMarker,
    hasConventionalCommits: conventional,
  }
}

export function createDefaultDeps(): PrCheckDeps {
  return {
    execSync,
    getEnv: (key: string) => process.env[key],
    writeOutput: (name: string, value: string) => {
      const outputFile = process.env.GITHUB_OUTPUT
      if (!outputFile) {
        return
      }
      appendFileSync(outputFile, `${name}=${value}\n`, { encoding: 'utf8' })
    },
    log: console.log,
    warn: console.warn,
  }
}

export function writeOutputs(result: PrCheckResult, deps: PrCheckDeps) {
  const commitsEncoded = Buffer.from(JSON.stringify(result.commits), 'utf8').toString('base64')
  const filesEncoded = Buffer.from(JSON.stringify(result.changedFiles), 'utf8').toString('base64')

  deps.writeOutput('changelog_status', result.changelogStatus)
  deps.writeOutput('skip_changelog', result.skipChangelogMarker ? 'true' : 'false')
  deps.writeOutput('conventional_commits', result.hasConventionalCommits ? 'true' : 'false')
  deps.writeOutput('commit_messages', commitsEncoded)
  deps.writeOutput('changed_files', filesEncoded)
  deps.writeOutput('base_ref', result.baseRef ?? '')
  deps.writeOutput('head_ref', result.headRef)
}

export function renderSummary(result: PrCheckResult, deps: PrCheckDeps) {
  deps.log('🔍 PR hygiene check')
  deps.log(`  • Base ref: ${result.baseRef ?? '(not provided)'}`)
  deps.log(`  • Head ref: ${result.headRef}`)
  deps.log(`  • Commits inspected: ${result.commits.length}`)

  switch (result.changelogStatus) {
    case 'updated':
      deps.log('✅ CHANGELOG: updated in this PR')
      break
    case 'skipped':
      deps.log('ℹ️  CHANGELOG: skipped via [skip-changelog] marker')
      break
    default:
      deps.log('⚠️  CHANGELOG: no updates and no [skip-changelog] marker')
  }

  if (result.hasConventionalCommits) {
    deps.log('✅ Conventional commits detected')
  } else {
    deps.log('ℹ️  No conventional commits found')
  }
}

/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  const deps = createDefaultDeps()
  const args = parseArgs(process.argv.slice(2))
  const result = runPrCheck(args, deps)

  writeOutputs(result, deps)
  renderSummary(result, deps)
}
/* c8 ignore end */
