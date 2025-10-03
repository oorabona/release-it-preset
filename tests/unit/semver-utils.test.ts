import { describe, expect, it } from 'vitest'
import { isValidSemver, validateAndNormalizeSemver } from '../../scripts/lib/semver-utils'

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
})
