#!/usr/bin/env tsx
/**
 * Annotate [Unreleased] entries from typed pull request changelog blocks.
 */

import type { ExecSyncOptions } from 'node:child_process'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { ChangelogError } from './lib/errors.js'
import { getGitHubRepoUrl } from './lib/git-utils.js'
import { runScript } from './lib/run-script.js'

export interface AnnotateChangelogDeps {
  execSync: (command: string, options?: ExecSyncOptions) => Buffer | string
  readFileSync: typeof readFileSync
  writeFileSync: typeof writeFileSync
  getEnv: (key: string) => string | undefined
  log: (message: string) => void
  warn: (message: string) => void
}

export interface PullRequestInfo {
  number: number
  body?: string | null
  merged_at?: string | null
}

export interface ChangelogEntry {
  section: string
  text: string
  rawLine: string
  shaList: string[]
  prNumber: number | null
  order: number
}

export interface ChangelogNote {
  section: string
  text: string
}

interface UnreleasedBlock {
  prefix: string
  body: string
  suffix: string
}

interface ParsedUnreleased {
  entries: ChangelogEntry[]
  nonEntryLines: string[]
}

interface CandidateGroup {
  key: string
  kind: 'pr' | 'sha'
  ref: string
  entries: ChangelogEntry[]
  primarySha: string | null
}

interface ResolvedGroup {
  pr: PullRequestInfo
  entries: ChangelogEntry[]
  primarySha: string | null
}

const STANDARD_SECTION_ORDER = [
  '### Added',
  '### Changed',
  '### Deprecated',
  '### Removed',
  '### Fixed',
  '### Security',
  '### ⚠️ BREAKING CHANGES',
]

const DEFAULT_SECTION = '### Changed'
const BREAKING_SECTION = '### ⚠️ BREAKING CHANGES'

const CHANGELOG_TYPE_TO_SECTION: Record<string, string> = {
  added: '### Added',
  changed: '### Changed',
  deprecated: '### Deprecated',
  removed: '### Removed',
  fixed: '### Fixed',
  security: '### Security',
}

const GH_JSON_OPTIONS: ExecSyncOptions = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }

export function extractUnreleasedBlock(changelog: string, changelogPath = 'CHANGELOG.md'): UnreleasedBlock {
  const headerRegex = /^## \[Unreleased\][^\n]*(?:\r?\n|$)/m
  const headerMatch = headerRegex.exec(changelog)

  if (!headerMatch) {
    throw new ChangelogError(`No [Unreleased] section found in ${changelogPath}. Run release-it-preset update first.`)
  }

  const bodyStart = headerMatch.index + headerMatch[0].length
  const rest = changelog.slice(bodyStart)
  const nextSectionMatch = /^## \[/m.exec(rest)
  const bodyEnd = nextSectionMatch ? bodyStart + nextSectionMatch.index : changelog.length

  return {
    prefix: changelog.slice(0, bodyStart),
    body: changelog.slice(bodyStart, bodyEnd),
    suffix: changelog.slice(bodyEnd),
  }
}

export function normalizeSectionHeading(rawHeading: string): string {
  const stripped = rawHeading.replace(/^#+\s*/, '').trim()
  if (/breaking[-\s]+changes?/i.test(stripped) || /breaking/i.test(stripped)) {
    return BREAKING_SECTION
  }

  const standard = STANDARD_SECTION_ORDER.find(
    heading => heading.replace(/^###\s*/, '').toLowerCase() === stripped.toLowerCase(),
  )
  if (standard) {
    return standard
  }

  return stripped ? `### ${stripped}` : DEFAULT_SECTION
}

export function extractCommitShas(value: string): string[] {
  const shas = new Set<string>()

  for (const match of value.matchAll(/\/commit\/([0-9a-f]{7,40})/gi)) {
    shas.add(match[1].toLowerCase())
  }

  for (const match of value.matchAll(/\b([0-9a-f]{7,40})\b/gi)) {
    shas.add(match[1].toLowerCase())
  }

  return [...shas]
}

export function extractPrNumber(value: string): number | null {
  const explicitPr = value.match(/\bPR\s+#(\d{1,10})\b/i)
  if (explicitPr) {
    return Number.parseInt(explicitPr[1], 10)
  }

  const pullUrl = value.match(/\/pull\/(\d{1,10})\b/i)
  if (pullUrl) {
    return Number.parseInt(pullUrl[1], 10)
  }

  // Bare (#N) only counts in squash-suffix position (end of the descriptive
  // text, optionally followed by the generated commit link) — a mid-text
  // (#N) is an issue reference in the author's prose, not a PR marker.
  const squashSuffix = value.match(
    /\(#(\d{1,10})\)(?:\s+\(\[[0-9a-f]{7,40}\]\([^)]*\)\))?\s*$/i,
  )
  if (squashSuffix) {
    return Number.parseInt(squashSuffix[1], 10)
  }

  return null
}

export function choosePrimarySha(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && /^[0-9a-f]{7,40}$/i.test(value)) {
      return value.toLowerCase()
    }
  }

  return null
}

export function parseUnreleasedEntries(body: string): ParsedUnreleased {
  const entries: ChangelogEntry[] = []
  const nonEntryLines: string[] = []
  let currentSection = DEFAULT_SECTION
  let order = 0

  for (const line of body.split(/\r?\n/)) {
    const headingMatch = line.match(/^###\s+(.+?)\s*$/)
    if (headingMatch) {
      currentSection = normalizeSectionHeading(line)
      continue
    }

    const bulletMatch = line.match(/^\s*-\s+(.+?)\s*$/)
    if (!bulletMatch) {
      if (line.trim() && line.trim() !== 'No changes yet.') {
        nonEntryLines.push(line)
      }
      continue
    }

    const text = bulletMatch[1].trim()
    const shaList = extractCommitShas(text)
    entries.push({
      section: currentSection,
      text,
      rawLine: `- ${text}`,
      shaList,
      prNumber: extractPrNumber(text),
      order,
    })
    order += 1
  }

  return { entries, nonEntryLines }
}

export function groupEntriesForLookup(entries: ChangelogEntry[]): {
  groups: CandidateGroup[]
  passthrough: ChangelogEntry[]
} {
  const byKey = new Map<string, CandidateGroup>()
  const passthrough: ChangelogEntry[] = []

  for (const entry of entries) {
    if (entry.section === BREAKING_SECTION) {
      passthrough.push(entry)
      continue
    }

    // The commit sha is the authoritative key: the commits/<sha>/pulls
    // endpoint returns the true merged PR, while a textual (#N) may be an
    // issue reference. Only sha-less entries fall back to the PR number.
    if (entry.prNumber !== null && entry.shaList.length === 0) {
      const key = `pr:${entry.prNumber}`
      const existing = byKey.get(key)
      if (existing) {
        existing.entries.push(entry)
        existing.primarySha = choosePrimarySha([existing.primarySha, ...entry.shaList])
      } else {
        byKey.set(key, {
          key,
          kind: 'pr',
          ref: String(entry.prNumber),
          entries: [entry],
          primarySha: choosePrimarySha(entry.shaList),
        })
      }
      continue
    }

    const primarySha = choosePrimarySha(entry.shaList)
    if (!primarySha) {
      passthrough.push(entry)
      continue
    }

    const key = `sha:${primarySha}`
    const existing = byKey.get(key)
    if (existing) {
      existing.entries.push(entry)
      existing.primarySha = choosePrimarySha([existing.primarySha, ...entry.shaList])
    } else {
      byKey.set(key, {
        key,
        kind: 'sha',
        ref: primarySha,
        entries: [entry],
        primarySha,
      })
    }
  }

  return { groups: [...byKey.values()], passthrough }
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const stderr = (error as Error & { stderr?: Buffer | string }).stderr
    const stdout = (error as Error & { stdout?: Buffer | string }).stdout
    const pieces = [
      error.message,
      Buffer.isBuffer(stderr) ? stderr.toString('utf8') : stderr,
      Buffer.isBuffer(stdout) ? stdout.toString('utf8') : stdout,
    ].filter((piece): piece is string => typeof piece === 'string' && piece.trim().length > 0)
    return pieces.join('\n')
  }

  return String(error)
}

function parseGhJson(command: string, output: string): unknown {
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new ChangelogError(`GitHub CLI command returned invalid JSON: ${command}\n${errorText(error)}`)
  }
}

function execGhJson(command: string, deps: AnnotateChangelogDeps): unknown {
  try {
    const output = deps.execSync(command, GH_JSON_OPTIONS) as string
    return parseGhJson(command, output)
  } catch (error) {
    if (error instanceof ChangelogError) {
      throw error
    }
    throw new ChangelogError(`GitHub CLI command failed: ${command}\n${errorText(error)}`)
  }
}

function validatePrInfo(value: unknown, command: string): PullRequestInfo {
  if (!value || typeof value !== 'object') {
    throw new ChangelogError(`GitHub CLI command returned an invalid pull request response: ${command}`)
  }

  const maybe = value as Partial<PullRequestInfo>
  if (typeof maybe.number !== 'number' || !Number.isInteger(maybe.number)) {
    throw new ChangelogError(`GitHub CLI command returned a pull request without a number: ${command}`)
  }

  return {
    number: maybe.number,
    body: typeof maybe.body === 'string' ? maybe.body : null,
    merged_at: typeof maybe.merged_at === 'string' ? maybe.merged_at : null,
  }
}

export function fetchPullRequestByNumber(
  prNumber: number,
  deps: AnnotateChangelogDeps,
): PullRequestInfo | null {
  const command = `gh pr view ${prNumber} --json number,body`
  try {
    const output = deps.execSync(command, GH_JSON_OPTIONS) as string
    return validatePrInfo(parseGhJson(command, output), command)
  } catch (error) {
    if (error instanceof ChangelogError) {
      throw error
    }
    // A (#NNN) reference in bullet text may point at an issue, not a PR —
    // that is the author's text, not an annotation candidate. Only this
    // not-a-PR shape is benign; auth/network/API failures stay fatal.
    if (/could not resolve to a PullRequest|no pull requests? found|not found/i.test(errorText(error))) {
      return null
    }
    throw new ChangelogError(`GitHub CLI command failed: ${command}\n${errorText(error)}`)
  }
}

export function fetchPullRequestBySha(
  sha: string,
  ownerRepo: string,
  deps: AnnotateChangelogDeps,
): PullRequestInfo | null {
  const command = `gh api repos/${ownerRepo}/commits/${sha}/pulls --jq '[.[] | {number: .number, body: .body, merged_at: .merged_at}]'`
  const parsed = execGhJson(command, deps)

  if (!Array.isArray(parsed)) {
    throw new ChangelogError(`GitHub CLI command returned an invalid pulls response: ${command}`)
  }

  const merged = parsed.find(item => item && typeof item === 'object' && typeof item.merged_at === 'string')
  return merged ? validatePrInfo(merged, command) : null
}

function ownerRepoFromUrl(repoUrl: string): string | null {
  const match = repoUrl.trim().replace(/\/$/, '').match(/^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)$/)
  if (!match) {
    return null
  }

  const ownerRepo = match[1].replace(/\.git$/, '')
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(ownerRepo) ? ownerRepo : null
}

function getRequiredGitHubContext(deps: AnnotateChangelogDeps): { repoUrl: string; ownerRepo: string } {
  const repoUrl = getGitHubRepoUrl({
    execSync: deps.execSync,
    getEnv: deps.getEnv,
    warn: deps.warn,
  }).replace(/\/$/, '')
  const ownerRepo = ownerRepoFromUrl(repoUrl)

  if (!repoUrl || !ownerRepo) {
    throw new ChangelogError(
      'Could not determine GitHub repository. Set GITHUB_REPOSITORY or configure a GitHub origin remote before running annotate.',
    )
  }

  return { repoUrl, ownerRepo }
}

export function resolvePullRequestGroups(
  groups: CandidateGroup[],
  ownerRepo: string,
  deps: AnnotateChangelogDeps,
): { resolved: ResolvedGroup[]; unresolved: ChangelogEntry[] } {
  const byPrNumber = new Map<number, ResolvedGroup>()
  const unresolved: ChangelogEntry[] = []

  for (const group of groups) {
    const pr =
      group.kind === 'pr'
        ? fetchPullRequestByNumber(Number.parseInt(group.ref, 10), deps)
        : fetchPullRequestBySha(group.ref, ownerRepo, deps)

    if (!pr) {
      unresolved.push(...group.entries)
      continue
    }

    const existing = byPrNumber.get(pr.number)
    if (existing) {
      existing.entries.push(...group.entries)
      existing.primarySha = choosePrimarySha([
        existing.primarySha,
        group.primarySha,
        ...group.entries.flatMap(entry => entry.shaList),
      ])
    } else {
      byPrNumber.set(pr.number, {
        pr,
        entries: [...group.entries],
        primarySha: choosePrimarySha([group.primarySha, ...group.entries.flatMap(entry => entry.shaList)]),
      })
    }
  }

  return {
    resolved: [...byPrNumber.values()].sort((a, b) => {
      const aOrder = Math.min(...a.entries.map(entry => entry.order))
      const bOrder = Math.min(...b.entries.map(entry => entry.order))
      return aOrder - bOrder
    }),
    unresolved,
  }
}

function warnForPr(prNumber: number, deps: { warn?: (message: string) => void }, message: string): void {
  deps.warn?.(`Ignoring changelog block in PR #${prNumber}: ${message}`)
}

function normalizeBlockText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function extractStructuredChangelogNotes(
  body: string | null | undefined,
  options: { prNumber?: number; warn?: (message: string) => void } = {},
): ChangelogNote[] {
  if (!body) {
    return []
  }

  const notes: ChangelogNote[] = []
  const normalizedBody = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const openMarker = /<!--\s*changelog\s*:\s*([a-z]+)\s*-->/gi
  const closeMarker = /<!--\s*\/changelog\s*-->/i
  const prNumber = options.prNumber ?? 0

  for (const match of normalizedBody.matchAll(openMarker)) {
    const type = match[1].toLowerCase()
    const contentStart = match.index + match[0].length
    const rest = normalizedBody.slice(contentStart)
    const closeMatch = closeMarker.exec(rest)

    if (!closeMatch) {
      warnForPr(prNumber, options, 'unclosed marker')
      continue
    }

    const section = CHANGELOG_TYPE_TO_SECTION[type]
    if (!section) {
      warnForPr(prNumber, options, `unknown changelog type "${type}"`)
      continue
    }

    const text = normalizeBlockText(rest.slice(0, closeMatch.index))
    if (!text) {
      warnForPr(prNumber, options, `empty ${type} block`)
      continue
    }

    notes.push({ section, text })
  }

  return notes
}

// Only the CURRENT PR's own reference is stripped before re-appending it:
// a foreign trailing reference like "fixes issue (#123)" is the author's
// text and must survive verbatim.
function stripAnnotationReferences(text: string, prNumber: number): string {
  const ownReference = new RegExp(
    `\\s+\\(#${prNumber}\\)(?:\\s+\\(\\[[0-9a-f]{7,40}\\]\\([^)]+/commit/[0-9a-f]{7,40}\\)\\))?$`,
    'i',
  )
  return text
    .replace(ownReference, '')
    .replace(/\s+\(\[[0-9a-f]{7,40}\]\([^)]+\/commit\/[0-9a-f]{7,40}\)\)$/i, '')
    .trim()
}

function formatCommitReference(primarySha: string | null, repoUrl: string): string {
  if (!primarySha) {
    return ''
  }
  const shortSha = primarySha.substring(0, 7)
  return ` ([${shortSha}](${repoUrl}/commit/${shortSha}))`
}

function formatNote(note: ChangelogNote, primarySha: string | null, repoUrl: string, prNumber: number): ChangelogEntry {
  const text = stripAnnotationReferences(note.text, prNumber)
  const reference = ` (#${prNumber})${formatCommitReference(primarySha, repoUrl)}`
  return {
    section: note.section,
    text: `${text}${reference}`,
    rawLine: `- ${text}${reference}`,
    shaList: primarySha ? [primarySha] : [],
    prNumber,
    order: Number.MAX_SAFE_INTEGER,
  }
}

function notesForResolvedGroup(group: ResolvedGroup, deps: AnnotateChangelogDeps): ChangelogNote[] {
  return extractStructuredChangelogNotes(group.pr.body, { prNumber: group.pr.number, warn: deps.warn })
}

export function renderAnnotatedBody(
  parsed: ParsedUnreleased,
  resolvedGroups: ResolvedGroup[],
  unresolvedEntries: ChangelogEntry[],
  repoUrl: string,
  deps: AnnotateChangelogDeps,
): string | null {
  const renderedEntries: ChangelogEntry[] = [...unresolvedEntries]
  let annotatedGroups = 0

  for (const group of resolvedGroups) {
    const notes = notesForResolvedGroup(group, deps)
    if (notes.length === 0) {
      renderedEntries.push(...group.entries)
      continue
    }

    annotatedGroups += 1
    const primarySha = choosePrimarySha([group.primarySha, ...group.entries.flatMap(entry => entry.shaList)])
    for (const note of notes) {
      renderedEntries.push(formatNote(note, primarySha, repoUrl, group.pr.number))
    }
  }

  // Nothing was annotated: re-rendering would only restructure the existing
  // body (hoisting non-entry lines, reordering sections) without adding any
  // information — the caller must leave the file untouched.
  if (annotatedGroups === 0) {
    return null
  }

  if (renderedEntries.length === 0 && parsed.nonEntryLines.length === 0) {
    return '\nNo changes yet.\n\n'
  }

  const bySection = new Map<string, ChangelogEntry[]>()
  for (const entry of renderedEntries) {
    const list = bySection.get(entry.section) ?? []
    list.push(entry)
    bySection.set(entry.section, list)
  }

  const customSections = [...bySection.keys()].filter(section => !STANDARD_SECTION_ORDER.includes(section))
  const sections = [...STANDARD_SECTION_ORDER, ...customSections]
  const lines: string[] = []

  for (const line of parsed.nonEntryLines) {
    lines.push(line)
  }
  if (parsed.nonEntryLines.length > 0 && bySection.size > 0) {
    lines.push('')
  }

  for (const section of sections) {
    const entries = bySection.get(section)
    if (!entries?.length) {
      continue
    }

    lines.push(section)
    for (const entry of entries) {
      lines.push(entry.rawLine)
    }
    lines.push('')
  }

  return `\n${lines.join('\n').trim()}\n\n`
}

function readChangelog(changelogPath: string, deps: AnnotateChangelogDeps): string {
  try {
    return deps.readFileSync(changelogPath, 'utf8') as string
  } catch (error) {
    throw new ChangelogError(`Could not read ${changelogPath}. Run release-it-preset update first.\n${errorText(error)}`)
  }
}

export function annotateChangelog(deps: AnnotateChangelogDeps): void {
  const changelogPath = deps.getEnv('CHANGELOG_FILE') || 'CHANGELOG.md'
  deps.log('Annotating [Unreleased] section...')

  const changelog = readChangelog(changelogPath, deps)
  const block = extractUnreleasedBlock(changelog, changelogPath)
  const parsed = parseUnreleasedEntries(block.body)

  if (parsed.entries.length === 0) {
    deps.log('No changelog entries found in [Unreleased]')
    return
  }

  const { groups, passthrough } = groupEntriesForLookup(parsed.entries)
  if (groups.length === 0) {
    deps.log('No PR or commit references found in [Unreleased]')
    return
  }

  const { repoUrl, ownerRepo } = getRequiredGitHubContext(deps)
  const resolved = resolvePullRequestGroups(groups, ownerRepo, deps)
  const nextBody = renderAnnotatedBody(parsed, resolved.resolved, [...passthrough, ...resolved.unresolved], repoUrl, deps)
  if (nextBody === null) {
    deps.log('No changelog blocks found in the resolved pull requests — nothing to annotate')
    return
  }
  deps.writeFileSync(changelogPath, `${block.prefix}${nextBody}${block.suffix}`)

  deps.log(`Annotated ${resolved.resolved.length} pull request(s)`)
}

/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  void runScript({ error: console.error, exit: process.exit }, () =>
    annotateChangelog({
      execSync,
      readFileSync,
      writeFileSync,
      getEnv: (key: string) => process.env[key],
      log: console.log,
      warn: console.warn,
    }),
  )
}
/* c8 ignore end */
