/**
 * Semantic versioning utility functions
 */

type RangeEvaluation = boolean | null

const SEMVER_PATTERN = String.raw`v?\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`
const exactRangeRegex = new RegExp(String.raw`^=?${SEMVER_PATTERN}$`)
const caretRangeRegex = new RegExp(String.raw`^\^\s*(${SEMVER_PATTERN})$`)
const tildeRangeRegex = new RegExp(String.raw`^~\s*(${SEMVER_PATTERN})$`)
const greaterThanOrEqualRangeRegex = new RegExp(String.raw`^>=\s*(${SEMVER_PATTERN})$`)
const workspaceProtocolPassthroughRanges = new Set(['*', '^', '~'])

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  normalized: string
}

function hasPrereleaseOrBuildMetadata(version: string): boolean {
  const normalized = version.replace(/^v/, '')
  return normalized.includes('-') || normalized.includes('+')
}

function parseVersion(version: string): ParsedVersion | null {
  if (!isValidSemver(version)) {
    return null
  }

  const normalized = version.replace(/^v/, '')
  const [major, minor, patch] = normalized.split(/[+-]/)[0].split('.').map(Number)
  return { major, minor, patch, normalized }
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function includesCaretRange(version: ParsedVersion, base: ParsedVersion): boolean {
  if (compareVersions(version, base) < 0) {
    return false
  }

  if (base.major > 0) {
    return version.major === base.major
  }
  if (base.minor > 0) {
    return version.major === 0 && version.minor === base.minor
  }
  return version.major === 0 && version.minor === 0 && version.patch === base.patch
}

function includesTildeRange(version: ParsedVersion, base: ParsedVersion): boolean {
  return compareVersions(version, base) >= 0 && version.major === base.major && version.minor === base.minor
}

function normalizeWorkspaceProtocolRange(trimmed: string): string | null {
  if (!trimmed.startsWith('workspace:')) {
    return trimmed
  }

  const workspaceRange = trimmed.slice('workspace:'.length).trim()
  if (workspaceProtocolPassthroughRanges.has(workspaceRange)) {
    return '*'
  }

  if (
    exactRangeRegex.test(workspaceRange) ||
    caretRangeRegex.test(workspaceRange) ||
    tildeRangeRegex.test(workspaceRange) ||
    greaterThanOrEqualRangeRegex.test(workspaceRange)
  ) {
    return workspaceRange
  }

  return null
}

function evaluateRangePart(range: string, version: ParsedVersion): RangeEvaluation {
  const trimmed = range.trim()
  if (!trimmed) {
    return null
  }

  const normalizedRange = normalizeWorkspaceProtocolRange(trimmed)
  if (normalizedRange === null) {
    return null
  }
  if (normalizedRange === '*') {
    return true
  }

  const semverOperand = normalizedRange.replace(/^(?:=|\^|~|>=)\s*/, '')
  if (isValidSemver(semverOperand) && hasPrereleaseOrBuildMetadata(semverOperand)) {
    return null
  }

  const exactMatch = normalizedRange.match(exactRangeRegex)
  if (exactMatch) {
    const exact = parseVersion(normalizedRange.replace(/^=/, ''))
    return exact ? exact.normalized === version.normalized : null
  }

  const caretMatch = normalizedRange.match(caretRangeRegex)
  if (caretMatch) {
    const base = parseVersion(caretMatch[1])
    return base ? includesCaretRange(version, base) : null
  }

  const tildeMatch = normalizedRange.match(tildeRangeRegex)
  if (tildeMatch) {
    const base = parseVersion(tildeMatch[1])
    return base ? includesTildeRange(version, base) : null
  }

  const greaterThanOrEqualMatch = normalizedRange.match(greaterThanOrEqualRangeRegex)
  if (greaterThanOrEqualMatch) {
    const base = parseVersion(greaterThanOrEqualMatch[1])
    return base ? compareVersions(version, base) >= 0 : null
  }

  return null
}

/**
 * Validate if a string is a valid semantic version
 *
 * @param version Version string to validate (can have optional 'v' prefix)
 * @returns true if valid semver, false otherwise
 */
export function isValidSemver(version: string): boolean {
  const semverRegex = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  return semverRegex.test(version);
}

/**
 * Validate and normalize a semantic version string
 *
 * @param version Version string to validate
 * @throws Error if version is not valid semver
 * @returns Normalized version without 'v' prefix
 */
export function validateAndNormalizeSemver(version: string): string {
  if (!isValidSemver(version)) {
    throw new Error(`Invalid semantic version: "${version}". Expected format: [v]MAJOR.MINOR.PATCH[-prerelease][+buildmetadata]`);
  }
  return version.replace(/^v/, '');
}

/**
 * Check whether a dependency range includes a concrete workspace package version.
 *
 * This intentionally supports only the small zero-dependency subset doctor needs:
 * workspace: protocol ranges, exact versions, ^, ~, >=, and OR-joined (`||`)
 * combinations of those forms. Unknown syntax returns null so advisory checks can
 * skip it without producing false warnings.
 *
 * @param range Dependency range string from package.json
 * @param version Concrete workspace package version
 * @returns true/false when evaluated, null when the syntax is outside the supported subset
 */
export function rangeIncludesVersion(range: string, version: string): RangeEvaluation {
  const parsedVersion = parseVersion(version)
  if (!parsedVersion) {
    return null
  }
  if (hasPrereleaseOrBuildMetadata(version)) {
    return null
  }

  const parts = range.split(/\s*\|\|\s*/)
  let sawUnknown = false

  for (const part of parts) {
    const result = evaluateRangePart(part, parsedVersion)
    if (result === true) {
      return true
    }
    if (result === null) {
      sawUnknown = true
    }
  }

  return sawUnknown ? null : false
}
