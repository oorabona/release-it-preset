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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isValidSemver, rangeIncludesVersion } from './lib/semver-utils.js'
import {
  parsePnpmWorkspaceYaml,
  parseWorkspacesFromPackageJson,
  resolvePackagePaths,
} from './lib/workspace-detect.js'
import {
  hasGeneratedWorkflowMarker,
  normalizeWorkflowContent,
  readWorkflowTemplate,
} from './lib/workflow-template.js'

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
  readdirSync: typeof readdirSync
  readFileSync: typeof readFileSync
  getEnv: (key: string) => string | undefined
  cwd: () => string
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

const WORKFLOW_DIR = join('.github', 'workflows')
const WORKFLOW_FILE_NAME_REGEX = /^[A-Za-z0-9._-]+\.ya?ml$/

interface WorkflowFile {
  path: string
  content: string
}

interface WorkflowScan {
  files: WorkflowFile[]
  skippedFileNames: string[]
  unreadableFilePaths: string[]
  error?: string
}

function listWorkflowFiles(deps: DoctorDeps): WorkflowScan {
  if (!deps.existsSync(WORKFLOW_DIR)) {
    return { files: [], skippedFileNames: [], unreadableFilePaths: [] }
  }

  let entries: unknown
  try {
    entries = deps.readdirSync(WORKFLOW_DIR)
  } catch (error) {
    return {
      files: [],
      skippedFileNames: [],
      unreadableFilePaths: [],
      error: error instanceof Error ? error.message : 'workflow directory could not be read',
    }
  }

  if (!Array.isArray(entries)) {
    return {
      files: [],
      skippedFileNames: [],
      unreadableFilePaths: [],
      error: 'workflow directory listing did not return file names',
    }
  }

  const files: WorkflowFile[] = []
  const skippedFileNames: string[] = []
  const unreadableFilePaths: string[] = []

  for (const entry of entries) {
    if (typeof entry !== 'string' || !WORKFLOW_FILE_NAME_REGEX.test(entry)) {
      skippedFileNames.push(String(entry))
      continue
    }

    const path = join(WORKFLOW_DIR, entry)
    try {
      files.push({
        path,
        content: deps.readFileSync(path, 'utf8') as string,
      })
    } catch {
      unreadableFilePaths.push(path)
    }
  }

  return { files, skippedFileNames, unreadableFilePaths }
}

function formatSkippedWorkflowFiles(skippedFileNames: string[]): string[] {
  if (skippedFileNames.length === 0) {
    return []
  }

  return [
    'Skipped workflow file name(s) outside the generated-template allowlist:',
    ...skippedFileNames.map((name) => `- ${name}`),
  ]
}

function formatUnreadableWorkflowFiles(unreadableFilePaths: string[]): string[] {
  if (unreadableFilePaths.length === 0) {
    return []
  }

  return [
    'Unreadable workflow file(s) were not evaluated:',
    ...unreadableFilePaths.map((path) => `- ${path}`),
  ]
}

type PublishWorkflowFreshnessState =
  | 'WORKFLOW_DIR_UNREADABLE'
  | 'WORKFLOW_FILES_UNREADABLE'
  | 'NO_WORKFLOW_FILES'
  | 'NO_GENERATED_WORKFLOW'
  | 'TEMPLATE_UNAVAILABLE'
  | 'TEMPLATE_MISSING_MARKER'
  | 'GENERATED_WORKFLOWS_FRESH'
  | 'GENERATED_WORKFLOWS_STALE'

interface PublishWorkflowFreshnessContext {
  scan: WorkflowScan
  generatedWorkflowPaths: string[]
  staleWorkflowPaths: string[]
  templateError?: string
  templateMissingMarker: boolean
}

function classifyPublishWorkflowFreshness(
  context: PublishWorkflowFreshnessContext,
): PublishWorkflowFreshnessState {
  if (context.scan.error) return 'WORKFLOW_DIR_UNREADABLE'
  if (context.scan.files.length === 0) {
    return context.scan.unreadableFilePaths.length > 0 ? 'WORKFLOW_FILES_UNREADABLE' : 'NO_WORKFLOW_FILES'
  }
  if (context.generatedWorkflowPaths.length === 0) {
    return context.scan.unreadableFilePaths.length > 0 ? 'WORKFLOW_FILES_UNREADABLE' : 'NO_GENERATED_WORKFLOW'
  }
  if (context.templateError) return 'TEMPLATE_UNAVAILABLE'
  if (context.templateMissingMarker) return 'TEMPLATE_MISSING_MARKER'
  if (context.staleWorkflowPaths.length > 0) return 'GENERATED_WORKFLOWS_STALE'
  // Skipped files (name outside the supported pattern) could hold a stale
  // generated workflow — a clean PASS must never hide unscanned files.
  if (context.scan.unreadableFilePaths.length > 0 || context.scan.skippedFileNames.length > 0) {
    return 'WORKFLOW_FILES_UNREADABLE'
  }
  return 'GENERATED_WORKFLOWS_FRESH'
}

const PUBLISH_WORKFLOW_FRESHNESS_DECISIONS = {
  WORKFLOW_DIR_UNREADABLE: (context: PublishWorkflowFreshnessContext): CheckResult => ({
    name: 'publish workflow freshness',
    status: 'WARN',
    value: 'workflow directory not evaluated',
    detail: context.scan.error,
  }),
  WORKFLOW_FILES_UNREADABLE: (context: PublishWorkflowFreshnessContext): CheckResult => ({
    name: 'publish workflow freshness',
    status: 'WARN',
    value: 'workflow files partially evaluated',
    detail: [
      'One or more workflow files could not be read, so generated workflow freshness was not fully evaluated.',
      ...formatUnreadableWorkflowFiles(context.scan.unreadableFilePaths),
      ...formatSkippedWorkflowFiles(context.scan.skippedFileNames),
    ].join('\n'),
  }),
  // Omitted, not PASS: no workflow files at all means the domain is absent
  // (same not-applicable convention as the workspace ranges check).
  NO_WORKFLOW_FILES: (): null => null,
  NO_GENERATED_WORKFLOW: (context: PublishWorkflowFreshnessContext): CheckResult => ({
    name: 'publish workflow freshness',
    status: 'PASS',
    value: 'custom workflow(s) not evaluated',
    detail: [
      'No workflow generated by release-it-preset init --with-workflows was detected.',
      'Only files carrying the generated workflow marker are compared to the shipped template.',
      ...formatSkippedWorkflowFiles(context.scan.skippedFileNames),
      ...formatUnreadableWorkflowFiles(context.scan.unreadableFilePaths),
    ].join('\n'),
  }),
  TEMPLATE_UNAVAILABLE: (context: PublishWorkflowFreshnessContext): CheckResult => ({
    name: 'publish workflow freshness',
    status: 'WARN',
    value: 'canonical template unavailable',
    detail: context.templateError,
  }),
  TEMPLATE_MISSING_MARKER: (): CheckResult => ({
    name: 'publish workflow freshness',
    status: 'WARN',
    value: 'canonical template not evaluated',
    detail: 'The shipped workflow template does not carry the generated workflow marker.',
  }),
  GENERATED_WORKFLOWS_FRESH: (context: PublishWorkflowFreshnessContext): CheckResult => ({
    name: 'publish workflow freshness',
    status: 'PASS',
    value: `${context.generatedWorkflowPaths.length} generated workflow(s) fresh`,
    detail: [
      ...formatSkippedWorkflowFiles(context.scan.skippedFileNames),
      ...formatUnreadableWorkflowFiles(context.scan.unreadableFilePaths),
    ].join('\n') || undefined,
  }),
  GENERATED_WORKFLOWS_STALE: (context: PublishWorkflowFreshnessContext): CheckResult => ({
    name: 'publish workflow freshness',
    status: 'WARN',
    value: `${context.staleWorkflowPaths.length} generated workflow(s) stale`,
    detail: [
      'Generated workflow file(s) differ from the shipped release workflow template:',
      ...context.staleWorkflowPaths.map((path) => `- ${path}`),
      'Run release-it-preset init --with-workflows in a scratch directory and merge the generated workflow updates.',
      ...formatSkippedWorkflowFiles(context.scan.skippedFileNames),
      ...formatUnreadableWorkflowFiles(context.scan.unreadableFilePaths),
    ].join('\n'),
  }),
} satisfies Record<
  PublishWorkflowFreshnessState,
  (context: PublishWorkflowFreshnessContext) => CheckResult | null
>

export function validatePublishWorkflowFreshness(deps: DoctorDeps): CheckResult | null {
  const scan = listWorkflowFiles(deps)
  const generatedWorkflowPaths = scan.files
    .filter((file) => hasGeneratedWorkflowMarker(file.content))
    .map((file) => file.path)
  const staleWorkflowPaths: string[] = []
  let templateError: string | undefined
  let templateMissingMarker = false

  if (generatedWorkflowPaths.length > 0) {
    try {
      const template = readWorkflowTemplate(deps).content
      if (!hasGeneratedWorkflowMarker(template)) {
        templateMissingMarker = true
      } else {
        const normalizedTemplate = normalizeWorkflowContent(template)
        for (const file of scan.files) {
          if (
            hasGeneratedWorkflowMarker(file.content) &&
            normalizeWorkflowContent(file.content) !== normalizedTemplate
          ) {
            staleWorkflowPaths.push(file.path)
          }
        }
      }
    } catch (error) {
      templateError = error instanceof Error ? error.message : 'canonical workflow template unavailable'
    }
  }

  const context: PublishWorkflowFreshnessContext = {
    scan,
    generatedWorkflowPaths,
    staleWorkflowPaths,
    templateError,
    templateMissingMarker,
  }
  const state = classifyPublishWorkflowFreshness(context)
  return PUBLISH_WORKFLOW_FRESHNESS_DECISIONS[state](context)
}

function stripYamlComment(line: string): string {
  const commentIndex = line.indexOf('#')
  return (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trimEnd()
}

function countIndent(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0
}

interface YamlLine {
  index: number
  text: string
  trimmed: string
  indent: number
}

interface YamlMapping {
  key: string
  value: string
}

interface WorkflowJobBlock {
  id: string
  content: string
  indent: number
}

type WorkflowJobsParseResult =
  | {
      ok: true
      jobs: WorkflowJobBlock[]
    }
  | {
      ok: false
      reason: string
    }

type PermissionEvaluation = 'GRANTED' | 'MISSING' | 'NOT_EVALUATED'
type JobPermissionEvaluation = PermissionEvaluation | 'INHERIT'

interface WorkflowNpmProvenanceEvaluation {
  publishJobIds: string[]
  idTokenJobIds: string[]
  missingJobIds: string[]
  notEvaluatedReason?: string
}

function toYamlLines(content: string): { rawLines: string[]; lines: YamlLine[] } {
  const rawLines = content.split(/\r?\n/)
  return {
    rawLines,
    lines: rawLines
      .map((rawLine, index) => {
        const text = stripYamlComment(rawLine)
        return {
          index,
          text,
          trimmed: text.trim(),
          indent: countIndent(text),
        }
      })
      .filter((line) => line.trimmed !== ''),
  }
}

function parseYamlMapping(trimmed: string): YamlMapping | null {
  if (trimmed.startsWith('- ')) {
    return null
  }

  const match = trimmed.match(/^("[^"]+"|'[^']+'|[A-Za-z0-9_-]+)\s*:\s*(.*)$/)
  if (!match) {
    return null
  }

  const rawKey = match[1]
  const key =
    (rawKey.startsWith('"') && rawKey.endsWith('"')) ||
    (rawKey.startsWith("'") && rawKey.endsWith("'"))
      ? rawKey.slice(1, -1)
      : rawKey

  return {
    key,
    value: match[2].trim(),
  }
}

function parseWorkflowJobs(content: string): WorkflowJobsParseResult {
  const { rawLines, lines } = toYamlLines(content)
  const jobsLines = lines.filter((line) => {
    const mapping = parseYamlMapping(line.trimmed)
    return line.indent === 0 && mapping?.key === 'jobs'
  })

  if (jobsLines.length === 0) {
    return { ok: false, reason: 'top-level jobs block not detected' }
  }
  if (jobsLines.length > 1) {
    return { ok: false, reason: 'multiple top-level jobs blocks detected' }
  }

  const jobsLine = jobsLines[0]
  const jobsMapping = parseYamlMapping(jobsLine.trimmed)
  if (!jobsMapping || jobsMapping.value !== '') {
    return { ok: false, reason: 'top-level jobs block uses an inline or dynamic value' }
  }

  const firstAfterJobs = lines.findIndex((line) => line.index > jobsLine.index)
  const jobsBlockEnd =
    firstAfterJobs === -1
      ? rawLines.length
      : (lines.slice(firstAfterJobs).find((line) => line.indent <= jobsLine.indent)?.index ??
        rawLines.length)

  const jobLines = lines.filter((line) => line.index > jobsLine.index && line.index < jobsBlockEnd)
  if (jobLines.length === 0) {
    return { ok: false, reason: 'jobs block is empty' }
  }

  const jobIndent = jobLines[0].indent
  if (jobIndent <= jobsLine.indent) {
    return { ok: false, reason: 'jobs block has no nested job definitions' }
  }

  const jobStarts: Array<{ id: string; index: number }> = []
  for (const line of jobLines) {
    if (line.indent !== jobIndent) {
      continue
    }

    const mapping = parseYamlMapping(line.trimmed)
    if (!mapping) {
      return { ok: false, reason: 'jobs block contains an unsupported child entry' }
    }
    if (mapping.value !== '') {
      return { ok: false, reason: `job "${mapping.key}" uses an inline or dynamic value` }
    }

    jobStarts.push({ id: mapping.key, index: line.index })
  }

  if (jobStarts.length === 0) {
    return { ok: false, reason: 'jobs block has no supported job definitions' }
  }

  const jobs = jobStarts.map((job, index): WorkflowJobBlock => {
    const nextJob = jobStarts[index + 1]
    const endIndex = nextJob?.index ?? jobsBlockEnd
    return {
      id: job.id,
      content: rawLines.slice(job.index, endIndex).join('\n'),
      indent: jobIndent,
    }
  })

  return { ok: true, jobs }
}

function stripYamlQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function inlinePermissionsMapHasIdTokenWrite(value: string): boolean | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null
  }

  return /(?:^|,)\s*['"]?id-token['"]?\s*:\s*['"]?write['"]?\s*(?:,|$)/.test(
    trimmed.slice(1, -1),
  )
}

function scalarPermissionsValueHasIdTokenWrite(value: string): PermissionEvaluation | null {
  const scalar = stripYamlQuotes(value)
  if (scalar === 'write-all') {
    return 'GRANTED'
  }
  if (scalar === 'read-all') {
    return 'MISSING'
  }
  return null
}

function isDynamicYamlValue(value: string): boolean {
  return (
    value.startsWith('*') ||
    value.startsWith('&') ||
    value.startsWith('[') ||
    value.includes('${{')
  )
}

function evaluatePermissionsValue(value: string): PermissionEvaluation {
  const scalarResult = scalarPermissionsValueHasIdTokenWrite(value)
  if (scalarResult !== null) {
    return scalarResult
  }

  const inlineResult = inlinePermissionsMapHasIdTokenWrite(value)
  if (inlineResult !== null) {
    return inlineResult ? 'GRANTED' : 'MISSING'
  }

  return isDynamicYamlValue(value) ? 'NOT_EVALUATED' : 'MISSING'
}

function evaluatePermissionsLine(lines: YamlLine[], permissionsLine: YamlLine): PermissionEvaluation {
  const permissions = parseYamlMapping(permissionsLine.trimmed)
  if (!permissions) {
    return 'NOT_EVALUATED'
  }

  if (permissions.value !== '') {
    return evaluatePermissionsValue(permissions.value)
  }

  const permissionChildLines = lines.filter((line) => line.index > permissionsLine.index)
  const permissionBlockLines: YamlLine[] = []
  for (const line of permissionChildLines) {
    if (line.indent <= permissionsLine.indent) {
      break
    }
    permissionBlockLines.push(line)
  }

  if (permissionBlockLines.length === 0) {
    return 'MISSING'
  }

  const permissionChildIndent = permissionBlockLines[0].indent
  for (const line of permissionBlockLines) {
    if (line.indent !== permissionChildIndent) {
      continue
    }

    const mapping = parseYamlMapping(line.trimmed)
    if (!mapping || mapping.key === '<<' || isDynamicYamlValue(mapping.value)) {
      return 'NOT_EVALUATED'
    }
    if (mapping.key === 'id-token' && stripYamlQuotes(mapping.value) === 'write') {
      return 'GRANTED'
    }
  }

  return 'MISSING'
}

function evaluateWorkflowIdTokenWritePermission(content: string): PermissionEvaluation {
  const { lines } = toYamlLines(content)
  const permissionsLines = lines.filter((line) => {
    const mapping = parseYamlMapping(line.trimmed)
    return line.indent === 0 && mapping?.key === 'permissions'
  })

  if (permissionsLines.length === 0) {
    return 'MISSING'
  }
  if (permissionsLines.length > 1) {
    return 'NOT_EVALUATED'
  }

  return evaluatePermissionsLine(lines, permissionsLines[0])
}

function evaluateJobIdTokenWritePermission(job: WorkflowJobBlock): JobPermissionEvaluation {
  const { lines } = toYamlLines(job.content)
  const childLines = lines.filter((line) => line.index > 0 && line.indent > job.indent)
  if (childLines.length === 0) {
    return 'INHERIT'
  }

  const childIndent = childLines[0].indent
  const permissionsLines = childLines.filter((line) => {
    const mapping = parseYamlMapping(line.trimmed)
    return line.indent === childIndent && mapping?.key === 'permissions'
  })

  if (permissionsLines.length === 0) {
    return 'INHERIT'
  }
  if (permissionsLines.length > 1) {
    return 'NOT_EVALUATED'
  }

  return evaluatePermissionsLine(childLines, permissionsLines[0])
}

function resolveJobIdTokenWritePermission(
  job: WorkflowJobBlock,
  workflowPermission: PermissionEvaluation,
): PermissionEvaluation {
  const jobPermission = evaluateJobIdTokenWritePermission(job)
  return jobPermission === 'INHERIT' ? workflowPermission : jobPermission
}

export function workflowHasIdTokenWritePermission(content: string): boolean {
  const parsed = parseWorkflowJobs(content)
  if (!parsed.ok) {
    return false
  }

  const workflowPermission = evaluateWorkflowIdTokenWritePermission(content)
  return parsed.jobs.some(
    (job) => resolveJobIdTokenWritePermission(job, workflowPermission) === 'GRANTED',
  )
}

function contentWithoutYamlComments(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => stripYamlComment(line))
    .join('\n')
}

function workflowHasNpmPublishIntent(content: string): boolean {
  const body = contentWithoutYamlComments(content)
  return (
    /\bNPM_PUBLISH\s*:\s*(?:['"]?true['"]?|\$\{\{)/.test(body) ||
    /\bretry-publish(?![-\w])/.test(body) ||
    /\bnpm\s+publish\b/.test(body)
  )
}

function evaluateWorkflowNpmProvenance(content: string): WorkflowNpmProvenanceEvaluation {
  if (!workflowHasNpmPublishIntent(content)) {
    return {
      publishJobIds: [],
      idTokenJobIds: [],
      missingJobIds: [],
    }
  }

  const parsed = parseWorkflowJobs(content)
  if (!parsed.ok) {
    return {
      publishJobIds: [],
      idTokenJobIds: [],
      missingJobIds: [],
      notEvaluatedReason: parsed.reason,
    }
  }

  const publishJobs = parsed.jobs.filter((job) => workflowHasNpmPublishIntent(job.content))
  if (publishJobs.length === 0) {
    return {
      publishJobIds: [],
      idTokenJobIds: [],
      missingJobIds: [],
      notEvaluatedReason:
        'npm-publish signal is present, but no concrete publishing job could be identified',
    }
  }

  const idTokenJobIds: string[] = []
  const missingJobIds: string[] = []
  const notEvaluatedJobIds: string[] = []
  const workflowPermission = evaluateWorkflowIdTokenWritePermission(content)

  for (const job of publishJobs) {
    const permission = resolveJobIdTokenWritePermission(job, workflowPermission)
    if (permission === 'GRANTED') {
      idTokenJobIds.push(job.id)
    } else if (permission === 'MISSING') {
      missingJobIds.push(job.id)
    } else {
      notEvaluatedJobIds.push(job.id)
    }
  }

  return {
    publishJobIds: publishJobs.map((job) => job.id),
    idTokenJobIds,
    missingJobIds,
    notEvaluatedReason:
      notEvaluatedJobIds.length > 0
        ? `resolved permissions not evaluated for: ${notEvaluatedJobIds.join(', ')}`
        : undefined,
  }
}

type NpmProvenanceReadinessState =
  | 'NPM_PUBLISH_DISABLED'
  | 'WORKFLOW_DIR_UNREADABLE'
  | 'WORKFLOW_FILES_UNREADABLE'
  | 'WORKFLOW_FILES_SKIPPED'
  | 'NO_WORKFLOW_FILES'
  | 'NO_NPM_PUBLISH_WORKFLOW'
  | 'PUBLISHING_JOB_NOT_EVALUATED'
  | 'ID_TOKEN_WRITE_FOUND'
  | 'ID_TOKEN_WRITE_MISSING'

interface NpmProvenanceReadinessContext {
  scan: WorkflowScan
  publishJobRefs: string[]
  idTokenJobRefs: string[]
  missingJobRefs: string[]
  notEvaluatedWorkflowDetails: string[]
  npmPublish: string | undefined
}

function classifyNpmProvenanceReadiness(
  context: NpmProvenanceReadinessContext,
): NpmProvenanceReadinessState {
  if (context.npmPublish !== 'true') return 'NPM_PUBLISH_DISABLED'
  if (context.scan.error) return 'WORKFLOW_DIR_UNREADABLE'
  if (context.scan.files.length === 0 && context.scan.unreadableFilePaths.length === 0) {
    return 'NO_WORKFLOW_FILES'
  }
  if (context.scan.unreadableFilePaths.length > 0) return 'WORKFLOW_FILES_UNREADABLE'
  if (context.notEvaluatedWorkflowDetails.length > 0) return 'PUBLISHING_JOB_NOT_EVALUATED'
  if (context.publishJobRefs.length === 0) return 'NO_NPM_PUBLISH_WORKFLOW'
  if (context.missingJobRefs.length > 0) return 'ID_TOKEN_WRITE_MISSING'
  // A skipped file (name outside the supported pattern) could contain an
  // ungated publishing job — a clean PASS must never hide unscanned files.
  if (context.scan.skippedFileNames.length > 0) return 'WORKFLOW_FILES_SKIPPED'
  return 'ID_TOKEN_WRITE_FOUND'
}

function npmProvenanceMissingDetail(context: NpmProvenanceReadinessContext): string {
  return [
    'NPM_PUBLISH=true is set, but no evaluated publishing job declares permissions: id-token: write.',
    'Add id-token: write under top-level permissions or jobs.<publishing-job>.permissions; job-level permissions override workflow-level permissions.',
    ...context.missingJobRefs.map((ref) => `- missing on ${ref}`),
    ...formatSkippedWorkflowFiles(context.scan.skippedFileNames),
    ...formatUnreadableWorkflowFiles(context.scan.unreadableFilePaths),
  ].join('\n')
}

const NPM_PROVENANCE_READINESS_DECISIONS = {
  // Omitted, not PASS: matches the not-applicable convention of the
  // workspace ranges check and the documented "when NPM_PUBLISH=true" gate.
  NPM_PUBLISH_DISABLED: (): null => null,
  WORKFLOW_DIR_UNREADABLE: (context: NpmProvenanceReadinessContext): CheckResult => ({
    name: 'npm provenance readiness',
    status: 'WARN',
    value: 'workflow directory not evaluated',
    detail: context.scan.error,
  }),
  WORKFLOW_FILES_UNREADABLE: (context: NpmProvenanceReadinessContext): CheckResult => ({
    name: 'npm provenance readiness',
    status: 'WARN',
    value: 'workflow files not evaluated',
    detail: [
      'One or more workflow files could not be read, so npm provenance readiness was not fully evaluated.',
      ...formatUnreadableWorkflowFiles(context.scan.unreadableFilePaths),
      ...formatSkippedWorkflowFiles(context.scan.skippedFileNames),
    ].join('\n'),
  }),
  NO_WORKFLOW_FILES: (context: NpmProvenanceReadinessContext): CheckResult => ({
    name: 'npm provenance readiness',
    status: 'WARN',
    value: 'id-token: write not detected',
    detail: npmProvenanceMissingDetail(context),
  }),
  NO_NPM_PUBLISH_WORKFLOW: (context: NpmProvenanceReadinessContext): CheckResult => ({
    name: 'npm provenance readiness',
    status: 'WARN',
    value: 'npm publish workflow not detected',
    detail: [
      'NPM_PUBLISH=true is set, but no allowlisted workflow file contains a supported npm-publish signal.',
      'Supported signals: NPM_PUBLISH, retry-publish, or npm publish.',
      ...formatSkippedWorkflowFiles(context.scan.skippedFileNames),
      ...formatUnreadableWorkflowFiles(context.scan.unreadableFilePaths),
    ].join('\n'),
  }),
  WORKFLOW_FILES_SKIPPED: (context: NpmProvenanceReadinessContext): CheckResult => ({
    name: 'npm provenance readiness',
    status: 'WARN',
    value: 'workflow files partially evaluated',
    detail: [
      'Evaluated publishing jobs all resolve to id-token: write, but some workflow files were skipped because their name is outside the supported pattern, so they may contain an unverified publishing job.',
      ...formatSkippedWorkflowFiles(context.scan.skippedFileNames),
      'Rename the skipped file(s) to a simple name (letters, digits, dot, underscore, dash) or review their permissions manually.',
    ].join('\n'),
  }),
  PUBLISHING_JOB_NOT_EVALUATED: (context: NpmProvenanceReadinessContext): CheckResult => ({
    name: 'npm provenance readiness',
    status: 'WARN',
    value: 'publishing job permissions not evaluated',
    detail: [
      'NPM_PUBLISH=true is set, but one or more npm-publish workflow structures or permissions could not be evaluated.',
      'Doctor passes this check when the publishing job resolves to permissions: id-token: write, either directly or by inheriting workflow-level permissions.',
      'Not evaluated:',
      ...context.notEvaluatedWorkflowDetails.map((detail) => `- ${detail}`),
      ...context.missingJobRefs.map((ref) => `- missing on ${ref}`),
      ...formatSkippedWorkflowFiles(context.scan.skippedFileNames),
    ].join('\n'),
  }),
  ID_TOKEN_WRITE_FOUND: (context: NpmProvenanceReadinessContext): CheckResult => ({
    name: 'npm provenance readiness',
    status: 'PASS',
    value: `id-token: write detected on ${context.idTokenJobRefs.length} publishing job(s)`,
    detail: context.idTokenJobRefs.map((ref) => `- ${ref}`).join('\n'),
  }),
  ID_TOKEN_WRITE_MISSING: (context: NpmProvenanceReadinessContext): CheckResult => ({
    name: 'npm provenance readiness',
    status: 'WARN',
    value: 'id-token: write not detected',
    detail: npmProvenanceMissingDetail(context),
  }),
} satisfies Record<
  NpmProvenanceReadinessState,
  (context: NpmProvenanceReadinessContext) => CheckResult | null
>

export function validateNpmProvenanceReadiness(deps: DoctorDeps): CheckResult | null {
  const scan = listWorkflowFiles(deps)
  const publishJobRefs: string[] = []
  const idTokenJobRefs: string[] = []
  const missingJobRefs: string[] = []
  const notEvaluatedWorkflowDetails: string[] = []

  for (const file of scan.files) {
    const evaluation = evaluateWorkflowNpmProvenance(file.content)
    publishJobRefs.push(...evaluation.publishJobIds.map((jobId) => `${file.path}#${jobId}`))
    idTokenJobRefs.push(...evaluation.idTokenJobIds.map((jobId) => `${file.path}#${jobId}`))
    missingJobRefs.push(...evaluation.missingJobIds.map((jobId) => `${file.path}#${jobId}`))
    if (evaluation.notEvaluatedReason) {
      notEvaluatedWorkflowDetails.push(`${file.path}: ${evaluation.notEvaluatedReason}`)
    }
  }

  const context: NpmProvenanceReadinessContext = {
    scan,
    publishJobRefs,
    idTokenJobRefs,
    missingJobRefs,
    notEvaluatedWorkflowDetails,
    npmPublish: deps.getEnv('NPM_PUBLISH'),
  }
  const state = classifyNpmProvenanceReadiness(context)
  return NPM_PROVENANCE_READINESS_DECISIONS[state](context)
}

type DependencyField = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'

interface WorkspacePackage {
  name: string
  version: string
  dependencies: Array<{
    field: DependencyField
    name: string
    range: string
  }>
}

const DEPENDENCY_FIELDS: DependencyField[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every((v) => typeof v === 'string')
}

function collectDependencyRanges(pkg: Record<string, unknown>): WorkspacePackage['dependencies'] {
  const dependencies: WorkspacePackage['dependencies'] = []
  for (const field of DEPENDENCY_FIELDS) {
    const entries = pkg[field]
    if (!isStringRecord(entries)) {
      continue
    }
    for (const [name, range] of Object.entries(entries)) {
      dependencies.push({ field, name, range })
    }
  }
  return dependencies
}

function isSupportedWorkspacePattern(pattern: string): boolean {
  if (/[?{}[\]]/.test(pattern)) {
    return false
  }

  const starCount = (pattern.match(/\*/g) ?? []).length
  if (starCount === 0) {
    return true
  }

  return starCount === 1 && pattern.endsWith('/*')
}

function classifyWorkspacePatterns(patterns: string[]): {
  supportedPatterns: string[]
  unsupportedPatterns: string[]
  negatedPatterns: string[]
} {
  const supportedPatterns: string[] = []
  const unsupportedPatterns: string[] = []
  const negatedPatterns: string[] = []

  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      negatedPatterns.push(pattern)
    } else if (isSupportedWorkspacePattern(pattern)) {
      supportedPatterns.push(pattern)
    } else {
      unsupportedPatterns.push(pattern)
    }
  }

  return { supportedPatterns, unsupportedPatterns, negatedPatterns }
}

function formatUnsupportedPatternDetails(patterns: string[]): string[] {
  if (patterns.length === 0) {
    return []
  }

  return [
    'Unsupported workspace pattern(s) were not evaluated:',
    ...patterns.map((pattern) => `- ${pattern}: pattern not supported by this check`),
  ]
}

function formatNegatedPatternDetails(patterns: string[]): string {
  return [
    'Negated workspace pattern(s) are not supported by this check; internal dependency ranges were not evaluated.',
    ...patterns.map((pattern) => `- ${pattern}: exclusion pattern not supported`),
    'Remove negated workspace patterns or verify internal dependency ranges manually.',
  ].join('\n')
}

function formatUnreadableManifestDetail(unreadableManifestCount: number): string | undefined {
  return unreadableManifestCount > 0
    ? `${unreadableManifestCount} manifest(s) unreadable; those packages were not evaluated.`
    : undefined
}

function readWorkspacePatterns(deps: DoctorDeps): { patterns: string[]; error?: string } | null {
  if (deps.existsSync('pnpm-workspace.yaml')) {
    try {
      const content = deps.readFileSync('pnpm-workspace.yaml', 'utf8') as string
      return { patterns: parsePnpmWorkspaceYaml(content) }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown parser error'
      return {
        patterns: [],
        error: [
          'pnpm-workspace.yaml could not be parsed; internal dependency ranges were not verified.',
          reason,
        ].join('\n'),
      }
    }
  }

  if (!deps.existsSync('package.json')) {
    return null
  }

  try {
    const content = deps.readFileSync('package.json', 'utf8') as string
    const patterns = parseWorkspacesFromPackageJson(content)
    return patterns.length > 0 ? { patterns } : null
  } catch (error) {
    return {
      patterns: [],
      error: [
        'package.json workspaces field could not be read; internal dependency ranges were not verified.',
        error instanceof Error ? error.message : 'unknown parser error',
      ].join('\n'),
    }
  }
}

function readWorkspacePackages(packageDirs: string[], deps: DoctorDeps): {
  packages: WorkspacePackage[]
  unreadableManifestCount: number
} {
  const packages: WorkspacePackage[] = []
  let unreadableManifestCount = 0

  for (const packageDir of packageDirs) {
    try {
      const raw = deps.readFileSync(join(packageDir, 'package.json'), 'utf8') as string
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        unreadableManifestCount += 1
        continue
      }

      const pkg = parsed as Record<string, unknown>
      if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') {
        unreadableManifestCount += 1
        continue
      }
      if (!isValidSemver(pkg.version)) {
        unreadableManifestCount += 1
        continue
      }
      packages.push({
        name: pkg.name,
        version: pkg.version,
        dependencies: collectDependencyRanges(pkg),
      })
    } catch {
      unreadableManifestCount += 1
    }
  }

  return { packages, unreadableManifestCount }
}

export function validateWorkspaceDependencyRanges(deps: DoctorDeps): CheckResult | null {
  const workspacePatterns = readWorkspacePatterns(deps)
  if (workspacePatterns === null) {
    return null
  }

  if (workspacePatterns.error) {
    return {
      name: 'Workspace dependency ranges',
      status: 'WARN',
      value: 'workspace configuration not evaluated',
      detail: workspacePatterns.error,
    }
  }

  const { patterns } = workspacePatterns
  if (patterns.length === 0) {
    return {
      name: 'Workspace dependency ranges',
      status: 'PASS',
      value: 'no workspace packages declared',
    }
  }

  const { supportedPatterns, unsupportedPatterns, negatedPatterns } = classifyWorkspacePatterns(patterns)
  if (negatedPatterns.length > 0) {
    return {
      name: 'Workspace dependency ranges',
      status: 'WARN',
      value: 'not evaluated',
      detail: formatNegatedPatternDetails(negatedPatterns),
    }
  }

  let packageDirs: string[]
  try {
    packageDirs =
      supportedPatterns.length > 0
        ? resolvePackagePaths(supportedPatterns, deps.cwd(), {
            existsSync: deps.existsSync,
            readdirSync: deps.readdirSync,
          })
        : []
  } catch (error) {
    return {
      name: 'Workspace dependency ranges',
      status: 'WARN',
      value: 'not evaluated',
      detail: [
        error instanceof Error ? error.message : 'Could not resolve workspace package paths',
        ...formatUnsupportedPatternDetails(unsupportedPatterns),
      ].join('\n'),
    }
  }

  if (packageDirs.length === 0) {
    if (unsupportedPatterns.length > 0) {
      return {
        name: 'Workspace dependency ranges',
        status: 'WARN',
        value: 'workspace ranges partially evaluated',
        detail: [
          supportedPatterns.length > 0
            ? 'Supported workspace pattern(s) did not resolve any package directories; ranges were not evaluated.'
            : 'No supported workspace patterns were available; ranges were not evaluated.',
          ...formatUnsupportedPatternDetails(unsupportedPatterns),
        ].join('\n'),
      }
    }

    return {
      name: 'Workspace dependency ranges',
      status: 'WARN',
      value: 'workspace packages not resolved — ranges not evaluated',
      detail: [
        'Declared workspace pattern(s) did not resolve any package directories.',
        ...supportedPatterns.map((pattern) => `- ${pattern}`),
      ].join('\n'),
    }
  }

  const { packages, unreadableManifestCount } = readWorkspacePackages(packageDirs, deps)
  if (packages.length === 0) {
    return {
      name: 'Workspace dependency ranges',
      status: 'WARN',
      value: 'workspace manifests unreadable — ranges not evaluated',
      detail: [
        'Resolved workspace package path(s) did not contain readable, valid package.json manifests.',
        formatUnreadableManifestDetail(unreadableManifestCount),
        ...formatUnsupportedPatternDetails(unsupportedPatterns),
      ].filter(Boolean).join('\n'),
    }
  }

  const versionByName = new Map(packages.map((pkg) => [pkg.name, pkg.version]))
  const staleRanges: string[] = []
  const skippedRanges: string[] = []
  let coherentRangeCount = 0
  let internalRangeCount = 0

  for (const pkg of packages) {
    for (const dependency of pkg.dependencies) {
      const internalVersion = versionByName.get(dependency.name)
      if (!internalVersion) {
        continue
      }

      internalRangeCount += 1
      const includesVersion = rangeIncludesVersion(dependency.range, internalVersion)
      if (includesVersion === true) {
        coherentRangeCount += 1
      } else if (includesVersion === false) {
        staleRanges.push(
          `${pkg.name} ${dependency.field}.${dependency.name}="${dependency.range}" does not include ${internalVersion}`,
        )
      } else {
        skippedRanges.push(`${pkg.name} ${dependency.field}.${dependency.name}="${dependency.range}"`)
      }
    }
  }

  if (staleRanges.length > 0) {
    return {
      name: 'Workspace dependency ranges',
      status: 'WARN',
      value: `${staleRanges.length} stale internal range(s)`,
      detail: [
        ...staleRanges.slice(0, 10).map((item) => `- ${item}`),
        staleRanges.length > 10 ? `- ...and ${staleRanges.length - 10} more` : '',
        'Update the range to include the current internal package version, or use the workspace: protocol.',
        formatUnreadableManifestDetail(unreadableManifestCount),
        ...formatUnsupportedPatternDetails(unsupportedPatterns),
      ].filter(Boolean).join('\n'),
    }
  }

  const partialEvaluationDetails = [
    formatUnreadableManifestDetail(unreadableManifestCount),
    ...formatUnsupportedPatternDetails(unsupportedPatterns),
  ].filter(Boolean)

  if (partialEvaluationDetails.length > 0) {
    return {
      name: 'Workspace dependency ranges',
      status: 'WARN',
      value: 'workspace ranges partially evaluated',
      detail: [
        internalRangeCount === 0
          ? 'No internal package dependencies were found in readable workspace manifests.'
          : `${coherentRangeCount}/${internalRangeCount} internal range(s) coherent in readable workspace manifests.`,
        ...partialEvaluationDetails,
      ].join('\n'),
    }
  }

  if (internalRangeCount === 0) {
    return {
      name: 'Workspace dependency ranges',
      status: 'PASS',
      value: 'no internal package dependencies',
    }
  }

  return {
    name: 'Workspace dependency ranges',
    status: 'PASS',
    value: skippedRanges.length > 0
      ? `${coherentRangeCount}/${internalRangeCount} internal range(s) coherent; ${skippedRanges.length} skipped`
      : `${coherentRangeCount}/${internalRangeCount} internal range(s) coherent`,
    detail: skippedRanges.length > 0
      ? `Skipped unsupported range syntax: ${skippedRanges.slice(0, 5).join(', ')}`
      : undefined,
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

    let content: string | null = null
    try {
      content = deps.readFileSync(changelogPath, 'utf8') as string
    } catch (error) {
      checks.push({
        name: 'Keep a Changelog format',
        status: 'WARN',
        value: 'not evaluated',
        detail: `${changelogPath} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    if (content !== null) {
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
  const workspaceDependencyRanges = validateWorkspaceDependencyRanges(deps)
  if (workspaceDependencyRanges) {
    checks.push(workspaceDependencyRanges)
  }

  const publishWorkflowFreshness = validatePublishWorkflowFreshness(deps)
  if (publishWorkflowFreshness) {
    checks.push(publishWorkflowFreshness)
  }
  const npmProvenanceReadiness = validateNpmProvenanceReadiness(deps)
  if (npmProvenanceReadiness) {
    checks.push(npmProvenanceReadiness)
  }

  for (const result of validateReleaseItPeer(deps)) {
    checks.push(result)
  }

  return { checks, status: worstStatus(checks.map((c) => c.status)) }
}

// ---------------------------------------------------------------------------
// 4. Summary
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// 3b. Release-it peer-dependency checks
// ---------------------------------------------------------------------------

/**
 * Reads the preset's declared peerDependencies.release-it range.
 * Looks in node_modules/@oorabona/release-it-preset/package.json first
 * (installed package context), then ./package.json (source repo / dev),
 * then falls back to a hardcoded constant.
 */
function readPresetPeerRange(deps: DoctorDeps): string {
  const FALLBACK = '^19.0.0 || ^20.0.0'
  const candidates = [
    'node_modules/@oorabona/release-it-preset/package.json',
    'package.json',
  ]
  for (const candidate of candidates) {
    try {
      if (!deps.existsSync(candidate)) continue
      const raw = deps.readFileSync(candidate, 'utf8') as string
      const pkg = JSON.parse(raw) as Record<string, unknown>
      const peers = pkg.peerDependencies as Record<string, string> | undefined
      if (peers?.['release-it']) {
        return peers['release-it']
      }
    } catch {
      // continue to next candidate
    }
  }
  return FALLBACK
}

/**
 * Extracts the highest major version number from a semver range string.
 * Handles OR-joined ranges like "^19.0.0 || ^20.0.0" → 20.
 */
function highestMajorFromRange(range: string): number {
  const matches = range.match(/(\d+)\.\d+\.\d+/g) ?? []
  let max = 0
  for (const m of matches) {
    const major = parseInt(m.split('.')[0], 10)
    if (major > max) max = major
  }
  return max
}

/**
 * Checks whether an installed version satisfies a simplified peer range.
 * Supports "^X.Y.Z || ^A.B.C" — checks that the installed major matches
 * any major present in the range.
 */
function satisfiesPeerRange(version: string, range: string): boolean {
  const installedMajor = parseInt(version.replace(/^v/, '').split('.')[0], 10)
  const allowedMajors = Array.from(
    range.matchAll(/[~^]?(\d+)\.\d+\.\d+/g),
    (m) => parseInt(m[1], 10),
  )
  return allowedMajors.includes(installedMajor)
}

/**
 * Runs Check A (peer range satisfaction) and Check B (major version advisor).
 * Returns an array of CheckResult to be appended into validateConfiguration.
 * Check B is silently skipped when the npm registry is unreachable.
 */
export function validateReleaseItPeer(deps: DoctorDeps): CheckResult[] {
  const results: CheckResult[] = []
  const peerRange = readPresetPeerRange(deps)

  // --- Check A: release-it in supported peer range ---
  const lsOutput = safeExec('npm ls release-it --depth=0 --json', deps)
  if (!lsOutput) {
    results.push({
      name: 'release-it peer dependency',
      status: 'FAIL',
      value: 'not found',
      detail: 'release-it is not installed. Run: pnpm add -D release-it@^20',
    })
  } else {
    let installedVersion: string | undefined
    try {
      const parsed = JSON.parse(lsOutput) as {
        dependencies?: Record<string, { version?: string }>
      }
      installedVersion = parsed.dependencies?.['release-it']?.version
    } catch {
      // parse failure treated as not found
    }

    if (!installedVersion) {
      results.push({
        name: 'release-it peer dependency',
        status: 'FAIL',
        value: 'not found',
        detail: 'release-it is not installed. Run: pnpm add -D release-it@^20',
      })
    } else if (!satisfiesPeerRange(installedVersion, peerRange)) {
      results.push({
        name: 'release-it peer dependency',
        status: 'FAIL',
        value: installedVersion,
        detail: `Installed release-it ${installedVersion} is outside the supported range (${peerRange}). Run: pnpm add -D release-it@^20`,
      })
    } else {
      results.push({
        name: 'release-it peer dependency',
        status: 'PASS',
        value: installedVersion,
      })
    }
  }

  // --- Check B: release-it major version advisor ---
  // On network failure (null), skip the check entirely — no FAIL on outage.
  const latestOutput = safeExec('npm view release-it version', deps)
  if (latestOutput) {
    const latestVersion = latestOutput.trim()
    const latestMajor = parseInt(latestVersion.replace(/^v/, '').split('.')[0], 10)
    const supportedMaxMajor = highestMajorFromRange(peerRange)

    if (!Number.isNaN(latestMajor) && !Number.isNaN(supportedMaxMajor)) {
      if (latestMajor > supportedMaxMajor) {
        results.push({
          name: 'release-it major version',
          status: 'WARN',
          value: latestVersion,
          detail: `release-it ${latestMajor}.x available; preset's peer range max is ${supportedMaxMajor}.x. Coordinate with the preset maintainer before upgrading.`,
        })
      } else {
        results.push({
          name: 'release-it major version',
          status: 'PASS',
          value: latestVersion,
        })
      }
    }
  }
  // If latestOutput is null (network failure), push nothing for Check B.

  return results
}


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
    readdirSync,
    readFileSync,
    getEnv: (key: string) => process.env[key],
    cwd: () => process.cwd(),
  }

  const report = runDoctor(deps)

  if (isJson) {
    process.stdout.write(formatJson(report) + '\n')
  } else {
    process.stdout.write(formatHuman(report))
  }

  process.exit(report.summary.status === 'BLOCKED' ? 1 : 0)
}
