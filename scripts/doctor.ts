#!/usr/bin/env tsx
/**
 * Doctor — diagnostic checklist + readiness score for release-it-preset
 *
 * Inspects four categories:
 *   1. Environment  — all known env vars, source (env vs default)
 *   2. Repository   — git state (branch, tag, dirty WD, upstream)
 *   3. Configuration — CHANGELOG.md, .release-it.json, package.json
 *   4. Summary      — READY / WARNINGS / BLOCKED + score
 *
 * Usage:
 *   node dist/scripts/doctor.js
 *   node dist/scripts/doctor.js --json
 */

import type { ExecSyncOptions } from 'node:child_process'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { isValidSemver } from './lib/semver-utils.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL'

export interface CheckResult {
  name: string
  status: CheckStatus
  value: string
  detail?: string
}

export interface EnvVarInfo {
  name: string
  value: string | undefined
  source: 'env' | 'default' | 'unset'
  defaultValue?: string
}

export interface EnvironmentSection {
  checks: CheckResult[]
  vars: EnvVarInfo[]
  status: CheckStatus
}

export interface RepositorySection {
  checks: CheckResult[]
  status: CheckStatus
}

export interface ConfigurationSection {
  checks: CheckResult[]
  status: CheckStatus
}

export interface DoctorSummary {
  pass: number
  warn: number
  fail: number
  total: number
  score: string
  status: 'READY' | 'WARNINGS' | 'BLOCKED'
  recommendations: string[]
}

export interface DoctorReport {
  environment: EnvironmentSection
  repository: RepositorySection
  configuration: ConfigurationSection
  summary: DoctorSummary
}

export interface DoctorDeps {
  execSync: (command: string, options?: ExecSyncOptions) => Buffer | string
  existsSync: typeof existsSync
  readFileSync: typeof readFileSync
  getEnv: (key: string) => string | undefined
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function safeExec(command: string, deps: DoctorDeps): string | null {
  try {
    return (deps.execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }) as string).trim()
  } catch {
    return null
  }
}

function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes('FAIL')) return 'FAIL'
  if (statuses.includes('WARN')) return 'WARN'
  return 'PASS'
}

// ---------------------------------------------------------------------------
// ENV VAR CATALOG
// ---------------------------------------------------------------------------

const ENV_VAR_CATALOG: Array<{ name: string; defaultValue?: string }> = [
  { name: 'CHANGELOG_FILE', defaultValue: 'CHANGELOG.md' },
  { name: 'GIT_CHANGELOG_PATH' },
  { name: 'GIT_CHANGELOG_SINCE' },
  { name: 'GIT_COMMIT_MESSAGE', defaultValue: 'chore(release): v${version}' },
  { name: 'GIT_TAG_NAME', defaultValue: 'v${version}' },
  { name: 'GIT_REQUIRE_BRANCH', defaultValue: 'main' },
  { name: 'GIT_REQUIRE_UPSTREAM', defaultValue: 'false' },
  { name: 'GIT_REQUIRE_CLEAN', defaultValue: 'false' },
  { name: 'GIT_REMOTE', defaultValue: 'origin' },
  { name: 'GIT_CHANGELOG_COMMAND' },
  { name: 'GIT_CHANGELOG_DESCRIBE_COMMAND' },
  { name: 'GITHUB_RELEASE', defaultValue: 'false' },
  { name: 'GITHUB_REPOSITORY' },
  { name: 'NPM_PUBLISH', defaultValue: 'false' },
  { name: 'NPM_SKIP_CHECKS', defaultValue: 'false' },
  { name: 'NPM_ACCESS', defaultValue: 'public' },
  { name: 'NPM_TAG' },
]

// ---------------------------------------------------------------------------
// 1. Environment
// ---------------------------------------------------------------------------

export function collectEnvironment(deps: DoctorDeps): EnvironmentSection {
  const vars: EnvVarInfo[] = ENV_VAR_CATALOG.map(({ name, defaultValue }) => {
    const value = deps.getEnv(name)
    if (value !== undefined) {
      return { name, value, source: 'env' as const }
    }
    if (defaultValue !== undefined) {
      return { name, value: defaultValue, source: 'default' as const, defaultValue }
    }
    return { name, value: undefined, source: 'unset' as const, defaultValue }
  })

  const checks: CheckResult[] = []

  const githubRelease = deps.getEnv('GITHUB_RELEASE')
  const githubRepo = deps.getEnv('GITHUB_REPOSITORY')
  const npmPublish = deps.getEnv('NPM_PUBLISH')

  if (githubRelease === 'true' && !githubRepo) {
    checks.push({
      name: 'GITHUB_REPOSITORY set when GITHUB_RELEASE=true',
      status: 'WARN',
      value: '<unset>',
      detail: 'Set GITHUB_REPOSITORY=owner/repo to enable GitHub releases',
    })
  } else {
    checks.push({
      name: 'GitHub release configuration',
      status: 'PASS',
      value: githubRelease === 'true' ? 'enabled' : 'disabled (default)',
    })
  }

  if (npmPublish === 'true') {
    checks.push({
      name: 'npm publish configuration',
      status: 'PASS',
      value: 'enabled (NPM_PUBLISH=true)',
    })
  } else {
    checks.push({
      name: 'npm publish configuration',
      status: 'PASS',
      value: 'disabled (default — safe for local runs)',
    })
  }

  return {
    vars,
    checks,
    status: worstStatus(checks.map((c) => c.status)),
  }
}

// ---------------------------------------------------------------------------
// 2. Repository
// ---------------------------------------------------------------------------

export function inspectRepository(deps: DoctorDeps): RepositorySection {
  const checks: CheckResult[] = []

  const isGitRepo = safeExec('git rev-parse --git-dir', deps) !== null
  if (!isGitRepo) {
    checks.push({
      name: 'Git repository',
      status: 'FAIL',
      value: 'not a git repository',
      detail: 'Run doctor from inside a git repository',
    })
    return { checks, status: 'FAIL' }
  }
  checks.push({ name: 'Git repository', status: 'PASS', value: 'yes' })

  const branch = safeExec('git rev-parse --abbrev-ref HEAD', deps)
  const requiredBranch = deps.getEnv('GIT_REQUIRE_BRANCH') ?? 'main'
  if (!branch) {
    checks.push({
      name: 'Current branch',
      status: 'WARN',
      value: 'unknown',
      detail: 'Could not determine current branch',
    })
  } else if (requiredBranch && branch !== requiredBranch) {
    checks.push({
      name: 'Current branch',
      status: 'WARN',
      value: branch,
      detail: `GIT_REQUIRE_BRANCH is "${requiredBranch}" — release will fail on this branch`,
    })
  } else {
    checks.push({ name: 'Current branch', status: 'PASS', value: branch })
  }

  const latestTag = safeExec('git describe --tags --abbrev=0', deps)
  if (!latestTag) {
    checks.push({
      name: 'Latest tag',
      status: 'WARN',
      value: 'none',
      detail: 'No tags found — first release scenario',
    })
  } else {
    checks.push({ name: 'Latest tag', status: 'PASS', value: latestTag })
  }

  let commitCount = 0
  if (latestTag) {
    const countStr = safeExec(`git rev-list "${latestTag}"..HEAD --count`, deps)
    commitCount = countStr ? parseInt(countStr, 10) : 0
  } else {
    const countStr = safeExec('git rev-list HEAD --count', deps)
    commitCount = countStr ? parseInt(countStr, 10) : 0
  }
  checks.push({
    name: 'Commits since last tag',
    status: 'PASS',
    value: String(commitCount),
  })

  const dirtyOutput = safeExec('git status --porcelain', deps)
  const isDirty = dirtyOutput !== null && dirtyOutput.length > 0
  if (isDirty) {
    checks.push({
      name: 'Working directory clean',
      status: 'WARN',
      value: 'dirty',
      detail: 'Uncommitted changes present — release may fail if GIT_REQUIRE_CLEAN=true',
    })
  } else {
    checks.push({ name: 'Working directory clean', status: 'PASS', value: 'yes' })
  }

  const upstream = safeExec('git rev-parse --abbrev-ref @{u}', deps)
  if (!upstream) {
    checks.push({
      name: 'Upstream tracking branch',
      status: 'WARN',
      value: 'none',
      detail: 'No upstream set — git push will fail. Run: git push -u origin <branch>',
    })
  } else {
    checks.push({ name: 'Upstream tracking branch', status: 'PASS', value: upstream })
  }

  const remote = deps.getEnv('GIT_REMOTE') ?? 'origin'
  const remoteUrl = safeExec(`git config --get remote.${remote}.url`, deps)
  if (!remoteUrl) {
    checks.push({
      name: `Git remote (${remote})`,
      status: 'WARN',
      value: 'not configured',
      detail: `Remote "${remote}" not found. Set GIT_REMOTE or run: git remote add origin <url>`,
    })
  } else {
    checks.push({ name: `Git remote (${remote})`, status: 'PASS', value: remoteUrl })
  }

  return { checks, status: worstStatus(checks.map((c) => c.status)) }
}

// ---------------------------------------------------------------------------
// 3. Configuration
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Workspace integration helper (used by validateConfiguration)
// ---------------------------------------------------------------------------

function detectWorkspaceIntegration(deps: DoctorDeps): CheckResult {
  const hasPnpmWorkspace = deps.existsSync('pnpm-workspace.yaml')

  let hasWorkspacesField = false
  if (!hasPnpmWorkspace && deps.existsSync('package.json')) {
    try {
      const raw = deps.readFileSync('package.json', 'utf8') as string
      const pkg = JSON.parse(raw) as Record<string, unknown>
      const ws = pkg.workspaces
      hasWorkspacesField =
        Array.isArray(ws) ||
        (typeof ws === 'object' && ws !== null && Array.isArray((ws as { packages?: unknown }).packages))
    } catch {
      // package.json parse errors are reported by the version check — skip here
    }
  }

  const workspaceSetup = hasPnpmWorkspace || hasWorkspacesField
  if (!workspaceSetup) {
    return { name: 'Workspace integration', status: 'PASS', value: 'not a monorepo' }
  }

  const pluginInstalled = deps.existsSync(
    'node_modules/@release-it-plugins/workspaces/package.json',
  )
  if (pluginInstalled) {
    return { name: 'Workspace integration', status: 'PASS', value: 'plugin installed' }
  }

  const source = hasPnpmWorkspace ? 'pnpm-workspace.yaml present' : 'package.json workspaces field'
  return {
    name: 'Workspace integration',
    status: 'WARN',
    value: `Workspace setup detected (no plugin loaded): ${source}`,
    detail: [
      'For multi-package publish + cross-pkg dep sync, run:',
      '  pnpm add -D @release-it-plugins/workspaces',
      'Then add `"plugins": {"@release-it-plugins/workspaces": true}` to .release-it.json.',
      'Skip if you only need per-package CHANGELOG (use GIT_CHANGELOG_PATH).',
    ].join('\n'),
  }
}


export function validateConfiguration(deps: DoctorDeps): ConfigurationSection {
  const checks: CheckResult[] = []
  const changelogPath = deps.getEnv('CHANGELOG_FILE') ?? 'CHANGELOG.md'

  if (!deps.existsSync(changelogPath)) {
    checks.push({
      name: `${changelogPath} exists`,
      status: 'FAIL',
      value: 'missing',
      detail: `Run: release-it-preset init  OR create ${changelogPath} manually`,
    })
  } else {
    checks.push({ name: `${changelogPath} exists`, status: 'PASS', value: 'yes' })

    const content = deps.readFileSync(changelogPath, 'utf8') as string

    const hasKacHeader = /^# Changelog/m.test(content)
    if (!hasKacHeader) {
      checks.push({
        name: 'Keep a Changelog format',
        status: 'FAIL',
        value: 'invalid',
        detail: 'CHANGELOG.md must start with "# Changelog" (Keep a Changelog format)',
      })
    } else {
      checks.push({ name: 'Keep a Changelog format', status: 'PASS', value: 'valid' })
    }

    const unreleasedMatch = content.match(/## \[Unreleased\]([\s\S]*?)(?=## \[|$)/)
    if (!unreleasedMatch) {
      checks.push({
        name: '[Unreleased] section',
        status: 'FAIL',
        value: 'missing',
        detail: 'Add "## [Unreleased]" section — run: release-it-preset update',
      })
    } else {
      const unreleasedContent = unreleasedMatch[1].trim()
      const hasChanges = /^-/m.test(unreleasedContent)
      if (!unreleasedContent || !hasChanges) {
        checks.push({
          name: '[Unreleased] section',
          status: 'WARN',
          value: 'empty',
          detail: 'No entries yet — run: release-it-preset update',
        })
      } else {
        checks.push({ name: '[Unreleased] section', status: 'PASS', value: 'has content' })
      }
    }
  }

  const hasReleaseItJson = deps.existsSync('.release-it.json')
  if (!hasReleaseItJson) {
    checks.push({
      name: '.release-it.json exists',
      status: 'WARN',
      value: 'missing',
      detail: 'Optional but recommended. Run: release-it-preset init',
    })
  } else {
    checks.push({ name: '.release-it.json exists', status: 'PASS', value: 'yes' })

    try {
      const raw = deps.readFileSync('.release-it.json', 'utf8') as string
      const config = JSON.parse(raw) as Record<string, unknown>
      const extendsField = config.extends as string | undefined

      if (!extendsField) {
        checks.push({
          name: '.release-it.json extends preset',
          status: 'WARN',
          value: 'no extends field',
          detail: 'Add "extends": "@oorabona/release-it-preset/config/<name>" for CLI auto-detection',
        })
      } else if (!/@oorabona\/release-it-preset\/config\/[\w-]+/.test(extendsField)) {
        checks.push({
          name: '.release-it.json extends preset',
          status: 'WARN',
          value: extendsField,
          detail: 'extends does not point to @oorabona/release-it-preset/config/<name>',
        })
      } else {
        checks.push({
          name: '.release-it.json extends preset',
          status: 'PASS',
          value: extendsField,
        })
      }
    } catch {
      checks.push({
        name: '.release-it.json parseable',
        status: 'FAIL',
        value: 'parse error',
        detail: '.release-it.json contains invalid JSON',
      })
    }
  }

  if (!deps.existsSync('package.json')) {
    checks.push({
      name: 'package.json exists',
      status: 'FAIL',
      value: 'missing',
      detail: 'package.json is required for release-it',
    })
  } else {
    try {
      const raw = deps.readFileSync('package.json', 'utf8') as string
      const pkg = JSON.parse(raw) as Record<string, unknown>
      const version = pkg.version as string | undefined

      if (!version) {
        checks.push({
          name: 'package.json version',
          status: 'FAIL',
          value: 'missing',
          detail: 'Add "version" field to package.json',
        })
      } else if (!isValidSemver(version)) {
        checks.push({
          name: 'package.json version',
          status: 'FAIL',
          value: version,
          detail: `"${version}" is not a valid semver string`,
        })
      } else {
        checks.push({ name: 'package.json version', status: 'PASS', value: version })
      }
    } catch {
      checks.push({
        name: 'package.json parseable',
        status: 'FAIL',
        value: 'parse error',
        detail: 'package.json contains invalid JSON',
      })
    }
  }

  checks.push(detectWorkspaceIntegration(deps))

  return { checks, status: worstStatus(checks.map((c) => c.status)) }
}

// ---------------------------------------------------------------------------
// 4. Summary
// ---------------------------------------------------------------------------

export function summarize(report: Omit<DoctorReport, 'summary'>): DoctorSummary {
  const allChecks: CheckResult[] = [
    ...report.environment.checks,
    ...report.repository.checks,
    ...report.configuration.checks,
  ]

  const pass = allChecks.filter((c) => c.status === 'PASS').length
  const warn = allChecks.filter((c) => c.status === 'WARN').length
  const fail = allChecks.filter((c) => c.status === 'FAIL').length
  const total = allChecks.length
  const score = `${pass}/${total} checks passing`

  let status: DoctorSummary['status']
  if (fail > 0) {
    status = 'BLOCKED'
  } else if (warn > 0) {
    status = 'WARNINGS'
  } else {
    status = 'READY'
  }

  const recommendations: string[] = []
  if (fail > 0) {
    const failedNames = allChecks.filter((c) => c.status === 'FAIL').map((c) => c.name)
    const preview = failedNames.slice(0, 2).join(', ') + (failedNames.length > 2 ? '...' : '')
    recommendations.push(`Fix ${fail} blocking issue(s): ${preview}`)
  }
  if (warn > 0) {
    recommendations.push(`Review ${warn} warning(s) before releasing`)
  }
  if (status === 'READY') {
    recommendations.push('All checks pass — run: release-it-preset validate && release-it-preset default')
  }

  return { pass, warn, fail, total, score, status, recommendations }
}

// ---------------------------------------------------------------------------
// Main exported function (DI)
// ---------------------------------------------------------------------------

export function runDoctor(deps: DoctorDeps): DoctorReport {
  const environment = collectEnvironment(deps)
  const repository = inspectRepository(deps)
  const configuration = validateConfiguration(deps)
  const summary = summarize({ environment, repository, configuration })
  return { environment, repository, configuration, summary }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const ICONS: Record<CheckStatus, string> = {
  PASS: '[PASS]',
  WARN: '[WARN]',
  FAIL: '[FAIL]',
}

const STATUS_LABELS: Record<DoctorSummary['status'], string> = {
  READY: 'READY',
  WARNINGS: 'WARNINGS',
  BLOCKED: 'BLOCKED',
}

export function formatHuman(report: DoctorReport): string {
  const lines: string[] = []

  function sectionHeader(title: string): void {
    lines.push('')
    lines.push(title)
    lines.push('-'.repeat(60))
  }

  function renderChecks(checks: CheckResult[]): void {
    for (const check of checks) {
      const icon = ICONS[check.status]
      lines.push(`  ${icon} ${check.name}: ${check.value}`)
      if (check.detail) {
        lines.push(`       ${check.detail}`)
      }
    }
  }

  lines.push('')
  lines.push('release-it-preset doctor')
  lines.push('='.repeat(60))

  sectionHeader('1. Environment')
  renderChecks(report.environment.checks)
  lines.push('')
  lines.push(`  Environment variables (${report.environment.vars.length} total):`)
  for (const v of report.environment.vars) {
    const srcLabel = v.source === 'env' ? '(env)' : v.source === 'default' ? '(default)' : '(unset)'
    const displayVal = v.source === 'unset' ? '<not set>' : (v.value ?? '<not set>')
    lines.push(`    ${v.name.padEnd(35)} ${displayVal.padEnd(30)} ${srcLabel}`)
  }

  sectionHeader('2. Repository')
  renderChecks(report.repository.checks)

  sectionHeader('3. Configuration')
  renderChecks(report.configuration.checks)

  sectionHeader('4. Readiness Summary')
  const { summary } = report
  lines.push(`  Status : ${STATUS_LABELS[summary.status]}`)
  lines.push(`  Score  : ${summary.score}  (PASS: ${summary.pass}, WARN: ${summary.warn}, FAIL: ${summary.fail})`)
  if (summary.recommendations.length > 0) {
    lines.push('')
    lines.push('  Recommendations:')
    for (const rec of summary.recommendations) {
      lines.push(`    * ${rec}`)
    }
  }
  lines.push('')

  return lines.join('\n')
}

export function formatJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2)
}

// ---------------------------------------------------------------------------
// CLI entry (guarded)
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const isJson = process.argv.includes('--json')

  const deps: DoctorDeps = {
    execSync,
    existsSync,
    readFileSync,
    getEnv: (key: string) => process.env[key],
  }

  const report = runDoctor(deps)

  if (isJson) {
    process.stdout.write(formatJson(report) + '\n')
  } else {
    process.stdout.write(formatHuman(report))
  }

  process.exit(report.summary.status === 'BLOCKED' ? 1 : 0)
}
