import { describe, expect, it } from 'vitest'
import {
  isValidSemver,
  rangeIncludesVersion,
  validateAndNormalizeSemver,
} from '../../scripts/lib/semver-utils'

describe('semver-utils', () => {
  it('validates semver with optional v prefix', () => {
    expect(isValidSemver('1.0.0')).toBe(true)
    expect(isValidSemver('v2.3.4')).toBe(true)
    expect(isValidSemver('1.0')).toBe(false)
  })

  it('normalizes valid versions', () => {
    expect(validateAndNormalizeSemver('1.2.3')).toBe('1.2.3')
    expect(validateAndNormalizeSemver('v4.5.6')).toBe('4.5.6')
  })

  it('throws for invalid versions', () => {
    expect(() => validateAndNormalizeSemver('invalid')).toThrowError(
      'Invalid semantic version: "invalid". Expected format: [v]MAJOR.MINOR.PATCH[-prerelease][+buildmetadata]',
    )
  })

  it('treats workspace protocol ranges as including the workspace version', () => {
    expect(rangeIncludesVersion('workspace:*', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('workspace:^', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('workspace:~1.0.0', '1.2.3')).toBe(true)
  })

  it('evaluates exact ranges', () => {
    expect(rangeIncludesVersion('1.2.3', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('=1.2.3', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('1.2.4', '1.2.3')).toBe(false)
  })

  it('evaluates caret ranges', () => {
    expect(rangeIncludesVersion('^1.2.0', '1.3.0')).toBe(true)
    expect(rangeIncludesVersion('^1.2.0', '2.0.0')).toBe(false)
    expect(rangeIncludesVersion('^0.2.0', '0.2.5')).toBe(true)
    expect(rangeIncludesVersion('^0.2.0', '0.3.0')).toBe(false)
  })

  it('evaluates tilde ranges', () => {
    expect(rangeIncludesVersion('~1.2.0', '1.2.9')).toBe(true)
    expect(rangeIncludesVersion('~1.2.0', '1.3.0')).toBe(false)
  })

  it('evaluates greater-than-or-equal ranges', () => {
    expect(rangeIncludesVersion('>=1.2.0', '1.2.0')).toBe(true)
    expect(rangeIncludesVersion('>=1.2.0', '1.5.0')).toBe(true)
    expect(rangeIncludesVersion('>=1.2.0', '1.1.9')).toBe(false)
  })

  it('evaluates OR-joined supported ranges', () => {
    expect(rangeIncludesVersion('^0.9.0 || ^1.0.0', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('^0.9.0||^1.0.0', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('^0.9.0 || ^2.0.0', '1.2.3')).toBe(false)
  })

  it('returns null for unsupported range syntax', () => {
    expect(rangeIncludesVersion('>=1.0.0 <2.0.0', '1.2.3')).toBeNull()
    expect(rangeIncludesVersion('latest', '1.2.3')).toBeNull()
    expect(rangeIncludesVersion('latest || ^2.0.0', '1.2.3')).toBeNull()
  })

  it('returns null when the workspace version carries prerelease or build metadata', () => {
    expect(rangeIncludesVersion('^1.0.0', '1.0.0-beta.1')).toBeNull()
    expect(rangeIncludesVersion('>=1.0.0', '1.0.0-beta.1')).toBeNull()
    expect(rangeIncludesVersion('^1.0.0', '1.0.0+build.5')).toBeNull()
  })

  it('returns null when a range operand carries prerelease metadata', () => {
    expect(rangeIncludesVersion('^1.0.0-rc.1', '1.2.0')).toBeNull()
  })
})
